import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { StoredFile } from "@/models/StoredFile";
import type { AttachmentInput } from "@/lib/teaching/assignments";

/**
 * Claiming an uploaded file for the thing it was attached to.
 *
 * Uploading and attaching are separate steps — a teacher drags a PDF onto a
 * form they have not saved yet — so a `StoredFile` row exists for a while with
 * `attachedToId: null`. This is the step that closes that gap, and it does two
 * things the download route depends on:
 *
 *   1. **Verifies the caller uploaded it.** An attachment list is a list of
 *      ids from a request body. Without this check a teacher could attach
 *      another teacher's file id to their own note and publish it to their own
 *      cohort — laundering a file across colleges through a legitimate route.
 *   2. **Records what it belongs to**, which is the only thing
 *      `/api/files/:id` has to decide who may read it.
 *
 * Returns the attachments that were genuinely claimed. Anything the caller did
 * not upload is dropped rather than rejected: an id that went stale between a
 * form load and a save is a normal accident, and failing the whole save over it
 * would lose the teacher's text.
 */
export async function claimAttachments(input: {
  uploadedBy: string;
  attachments: AttachmentInput[] | undefined;
  attachedToType: "assignment" | "note" | "submission";
  attachedToId: Types.ObjectId | string;
}): Promise<AttachmentInput[]> {
  const requested = (input.attachments ?? []).filter((file) =>
    Types.ObjectId.isValid(file.fileId)
  );

  if (!requested.length) return [];

  await connectDB();

  /**
   * Fetched by id **and uploader**, so a file somebody else uploaded is simply
   * not found rather than found-and-refused.
   *
   * `attachedToId: null` is *not* in the filter: re-saving a form must be able
   * to re-claim the files it already claimed, or the second save would silently
   * drop every attachment.
   */
  const owned = await StoredFile.find({
    _id: { $in: requested.map((file) => new Types.ObjectId(file.fileId)) },
    uploadedBy: input.uploadedBy,
    deletedAt: null,
  })
    .select("_id fileName mimeType size attachedToId attachedToType")
    .lean();

  const ownedById = new Map(owned.map((file) => [String(file._id), file]));

  const claimed = requested.filter((file) => {
    const row = ownedById.get(file.fileId);
    if (!row) return false;

    // Already attached to something else entirely — a copy-pasted id from
    // another item. Dropped, because moving it would break that item.
    if (row.attachedToId && String(row.attachedToId) !== String(input.attachedToId)) {
      return false;
    }

    return true;
  });

  if (!claimed.length) return [];

  await StoredFile.updateMany(
    { _id: { $in: claimed.map((file) => new Types.ObjectId(file.fileId)) } },
    {
      $set: {
        attachedToType: input.attachedToType,
        attachedToId: new Types.ObjectId(String(input.attachedToId)),
      },
    }
  );

  /**
   * The *stored* metadata is returned, not what the caller sent.
   *
   * The body carries a filename, a MIME type and a size alongside each id, and
   * all three are the client's claim about a file the server already has on
   * record. Trusting them would let a request relabel a 40MB executable as a
   * 2KB PDF in every list that renders the denormalised copy.
   */
  return claimed.map((file) => {
    const row = ownedById.get(file.fileId)!;
    return {
      fileId: String(row._id),
      fileName: row.fileName,
      mimeType: row.mimeType,
      size: row.size,
    };
  });
}

/**
 * Release files an edit removed.
 *
 * They are un-attached rather than deleted, so the orphan sweep collects them
 * on its own schedule. Deleting here would mean a teacher who removes an
 * attachment and immediately re-adds it from the same form finds the bytes
 * gone.
 */
export async function releaseAttachments(input: {
  attachedToType: "assignment" | "note" | "submission";
  attachedToId: Types.ObjectId | string;
  keepFileIds: string[];
}): Promise<void> {
  try {
    await connectDB();

    await StoredFile.updateMany(
      {
        attachedToType: input.attachedToType,
        attachedToId: new Types.ObjectId(String(input.attachedToId)),
        _id: {
          $nin: input.keepFileIds
            .filter((id) => Types.ObjectId.isValid(id))
            .map((id) => new Types.ObjectId(id)),
        },
      },
      { $set: { attachedToType: null, attachedToId: null } }
    );
  } catch (err) {
    // A stale attachment is untidy, not dangerous: the item no longer lists it,
    // so nothing renders or serves it.
    console.error("[attachments] could not release removed files:", err);
  }
}
