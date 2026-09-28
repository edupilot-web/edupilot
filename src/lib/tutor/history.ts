import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { AiConversation, AiInteraction } from "@/models/Tutor";
import type { TutorAnswer } from "@/lib/tutor/schema";

/**
 * Reading what the tutor has already said (§14, §15).
 *
 * Nothing in this file calls a model, and that is the feature. §15 is explicit:
 * **View must not cost a request**. Every answer was validated and stored when
 * it was produced, so showing it again is a `findOne`. Only "Ask again" and
 * "Regenerate" go back to a provider, and they go through `service.ts`.
 *
 * Every query is filtered on `userId`. Not checked afterwards — filtered, so a
 * conversation id belonging to someone else returns nothing at all. §71 is the
 * one rule in the module where "we check it later" would be indistinguishable
 * from a breach in the one code path that forgot to.
 */

export type HistoryAnswer = TutorAnswer;

export type InteractionView = {
  id: string;
  conversationId: string;
  sequence: number;
  question: string;
  answer: HistoryAnswer | null;
  depthLevel: string;
  language: string;
  followUpAction: string | null;
  cacheHit: boolean;
  /**
   * The provider and model that answered.
   *
   * Returned by the API and deliberately **not** shown to students by default
   * (§39): which model answered is an implementation detail, and a student
   * comparing "Gemini said" with "DeepSeek said" is being invited to trust one
   * over the other on no basis at all. It is here for the admin views and for
   * support.
   */
  provider: string | null;
  model: string | null;
  status: string;
  helpful: boolean | null;
  regeneratedFromId: string | null;
  createdAt: string;
};

export type ConversationView = {
  id: string;
  subjectId: string;
  topicId: string;
  subjectName: string | null;
  topicTitle: string | null;
  title: string | null;
  depthLevel: string;
  language: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
};

export type ConversationDetail = ConversationView & {
  interactions: InteractionView[];
};

/** Every thread this student has, newest activity first. */
export async function listConversations(
  userId: string,
  options: { topicId?: string | null; limit?: number } = {}
): Promise<ConversationView[]> {
  await connectDB();

  const filter: Record<string, unknown> = { userId, archivedAt: null };
  if (options.topicId) {
    if (!Types.ObjectId.isValid(options.topicId)) return [];
    filter.topicId = options.topicId;
  }

  const rows = await AiConversation.find(filter)
    .sort({ updatedAt: -1 })
    .limit(Math.min(options.limit ?? 30, 100))
    .lean();

  return rows.map(toConversationView);
}

/**
 * One thread and its messages.
 *
 * Capped at fifty. A thread that long is already summarised for the model's
 * benefit; rendering two hundred answers into a panel would be a slow page for
 * a scroll nobody performs.
 */
export async function getConversation(
  userId: string,
  conversationId: string
): Promise<ConversationDetail | null> {
  if (!Types.ObjectId.isValid(conversationId)) return null;

  await connectDB();

  const conversation = await AiConversation.findOne({ _id: conversationId, userId }).lean();
  if (!conversation) return null;

  const interactions = await AiInteraction.find({ conversationId: conversation._id, userId })
    .sort({ sequence: 1 })
    .limit(50)
    .lean();

  return {
    ...toConversationView(conversation),
    interactions: interactions.map(toInteractionView),
  };
}

/** One stored answer — what the "View" button reads (§15). */
export async function getInteraction(
  userId: string,
  interactionId: string
): Promise<InteractionView | null> {
  if (!Types.ObjectId.isValid(interactionId)) return null;

  await connectDB();

  const row = await AiInteraction.findOne({ _id: interactionId, userId }).lean();
  return row ? toInteractionView(row) : null;
}

/**
 * Everything asked about one topic, across threads.
 *
 * The topic page's "Previously asked" list. Ordered by recency rather than by
 * conversation, because a student returning to a topic is looking for *the
 * question they asked*, and they do not remember which thread it was in.
 */
export async function historyForTopic(
  userId: string,
  topicId: string,
  limit = 20
): Promise<InteractionView[]> {
  if (!Types.ObjectId.isValid(topicId)) return [];

  await connectDB();

  const rows = await AiInteraction.find({ userId, topicId, status: "ok" })
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 50))
    .lean();

  return rows.map(toInteractionView);
}

/** Mark an answer helpful or not. Feedback, not moderation — it changes nothing. */
export async function rateInteraction(
  userId: string,
  interactionId: string,
  helpful: boolean
): Promise<boolean> {
  if (!Types.ObjectId.isValid(interactionId)) return false;

  await connectDB();

  const result = await AiInteraction.updateOne(
    { _id: interactionId, userId },
    { $set: { helpful } }
  );

  return result.matchedCount === 1;
}

/**
 * Archive a thread.
 *
 * A flag, not a delete. The interactions stay — they are what the usage and
 * cost records refer to, and a student hiding a conversation from their own
 * list is not asking for the platform's accounting to be rewritten.
 */
export async function archiveConversation(
  userId: string,
  conversationId: string
): Promise<boolean> {
  if (!Types.ObjectId.isValid(conversationId)) return false;

  await connectDB();

  const result = await AiConversation.updateOne(
    { _id: conversationId, userId, archivedAt: null },
    { $set: { archivedAt: new Date() } }
  );

  return result.matchedCount === 1;
}

// ── Mapping ───────────────────────────────────────────────────────────────

type ConversationRow = {
  _id: Types.ObjectId;
  subjectId: Types.ObjectId;
  topicId: Types.ObjectId;
  subjectName?: string | null;
  topicTitle?: string | null;
  title?: string | null;
  depthLevel?: string;
  language?: string;
  messageCount?: number;
  lastMessageAt?: Date | null;
  createdAt?: Date;
};

function toConversationView(row: ConversationRow): ConversationView {
  return {
    id: String(row._id),
    subjectId: String(row.subjectId),
    topicId: String(row.topicId),
    subjectName: row.subjectName ?? null,
    topicTitle: row.topicTitle ?? null,
    title: row.title ?? null,
    depthLevel: row.depthLevel ?? "basic",
    language: row.language ?? "english",
    messageCount: row.messageCount ?? 0,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

type InteractionRow = {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  sequence?: number;
  question: string;
  answer?: unknown;
  depthLevel?: string;
  language?: string;
  followUpAction?: string | null;
  cacheHit?: boolean;
  provider?: string | null;
  model?: string | null;
  status?: string;
  helpful?: boolean | null;
  regeneratedFromId?: Types.ObjectId | null;
  createdAt?: Date;
};

function toInteractionView(row: InteractionRow): InteractionView {
  return {
    id: String(row._id),
    conversationId: String(row.conversationId),
    sequence: row.sequence ?? 1,
    question: row.question,
    answer: (row.answer as HistoryAnswer) ?? null,
    depthLevel: row.depthLevel ?? "basic",
    language: row.language ?? "english",
    followUpAction: row.followUpAction ?? null,
    cacheHit: row.cacheHit === true,
    provider: row.provider ?? null,
    model: row.model ?? null,
    status: row.status ?? "ok",
    helpful: row.helpful ?? null,
    regeneratedFromId: row.regeneratedFromId ? String(row.regeneratedFromId) : null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
