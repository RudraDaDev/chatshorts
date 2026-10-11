import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import { storySchema } from './schema.js';

const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(storySchema);

export const TAIL_HOLD_MS = 1500; // time the final message stays on screen before the video ends
export const HOOK_WARN_MS = 5000; // first message should appear within this many ms

export function normalizeStory(raw) {
  const story = structuredClone(raw);
  story.schemaVersion ??= 1;
  story.theme ??= 'imessage';
  story.appearance ??= 'dark';
  story.statusTime ??= '9:41';
  story.localUser ??= { id: 'me', displayName: 'Me' };
  story.audio ??= {};
  story.audio.sfx ??= true;
  story.audio.music ??= null;
  story.audio.musicVolumeDb ??= -24;
  if (story.background) story.background.dim ??= 0.35;
  for (const m of story.messages) m.sound ??= 'auto';
  // Local user is implicit in every conversation; drop it from participant lists.
  for (const c of story.conversations) {
    c.participants = c.participants.filter((p) => p !== story.localUser.id);
  }
  return story;
}

/**
 * Validate a raw story object.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], story: object|null }}
 */
export function validateStory(raw, { storyDir = process.cwd() } = {}) {
  const errors = [];
  const warnings = [];

  if (!validateSchema(raw)) {
    for (const e of validateSchema.errors) {
      const where = e.instancePath || '(root)';
      const extra = e.params && e.params.additionalProperty ? ` "${e.params.additionalProperty}"` : '';
      errors.push(`schema: ${where} ${e.message}${extra}`);
    }
    return { ok: false, errors, warnings, story: null };
  }

  const story = normalizeStory(raw);
  const localId = story.localUser.id;
  const durationMs = Math.round(story.durationSeconds * 1000);

  // --- identifiers -------------------------------------------------------
  const contactIds = new Set();
  for (const c of story.contacts) {
    if (contactIds.has(c.id)) errors.push(`duplicate contact id "${c.id}"`);
    contactIds.add(c.id);
  }
  if (contactIds.has(localId)) errors.push(`localUser id "${localId}" collides with a contact id`);
  const nameCount = new Map();
  for (const c of story.contacts) nameCount.set(c.displayName, (nameCount.get(c.displayName) || 0) + 1);
  for (const [name, n] of nameCount) if (n > 1) warnings.push(`${n} contacts share the display name "${name}"`);

  const convById = new Map();
  for (const c of story.conversations) {
    if (convById.has(c.id)) errors.push(`duplicate conversation id "${c.id}"`);
    convById.set(c.id, c);
  }

  const msgIds = new Set();
  for (const m of story.messages) {
    if (msgIds.has(m.id)) errors.push(`duplicate message id "${m.id}"`);
    msgIds.add(m.id);
  }

  // --- conversations -----------------------------------------------------
  const usedContacts = new Set();
  for (const c of story.conversations) {
    for (const p of c.participants) {
      if (!contactIds.has(p)) errors.push(`conversation "${c.id}" lists unknown participant "${p}"`);
      usedContacts.add(p);
    }
    const others = c.participants.filter((p) => contactIds.has(p));
    if (c.type === 'direct' && others.length !== 1) {
      errors.push(`direct conversation "${c.id}" must have exactly one other participant (has ${others.length})`);
    }
    if (c.type === 'group' && others.length < 2) {
      errors.push(`group conversation "${c.id}" needs at least two other participants (has ${others.length})`);
    }
  }
  for (const c of story.contacts) {
    if (!usedContacts.has(c.id) && !story.messages.some((m) => m.senderId === c.id)) {
      warnings.push(`contact "${c.id}" is never used`);
    }
  }

  // --- messages ----------------------------------------------------------
  const messagesByConv = new Map();
  let prevReveal = -Infinity;
  let prevId = null;
  story.messages.forEach((m, i) => {
    const where = `message "${m.id}"`;
    if (!m.text.trim()) errors.push(`${where} has empty text`);
    const conv = convById.get(m.conversationId);
    if (!conv) {
      errors.push(`${where} references unknown conversation "${m.conversationId}"`);
    } else {
      const isLocal = m.senderId === localId;
      if (!isLocal && !contactIds.has(m.senderId)) {
        errors.push(`${where} has unknown sender "${m.senderId}"`);
      } else if (!isLocal && !conv.participants.includes(m.senderId)) {
        errors.push(`${where}: sender "${m.senderId}" is not a participant of "${conv.id}"`);
      }
      if (!messagesByConv.has(conv.id)) messagesByConv.set(conv.id, []);
      messagesByConv.get(conv.id).push(m);
    }
    if (m.revealAtMs < prevReveal) {
      errors.push(`${where} reveals at ${m.revealAtMs}ms, before previous message "${prevId}" (${prevReveal}ms); messages must be in reveal order`);
    } else if (i > 0 && m.revealAtMs - prevReveal < 400) {
      warnings.push(`${where} follows "${prevId}" within ${m.revealAtMs - prevReveal}ms; very fast bursts can feel cramped`);
    }
    if (m.text.trim().length > 180) warnings.push(`${where} is ${m.text.trim().length} characters; long bubbles slow the pacing`);
    if (m.timestamp !== undefined && !m.timestamp.trim()) errors.push(`${where} has an empty timestamp label`);
    prevReveal = m.revealAtMs;
    prevId = m.id;
  });

  for (const c of story.conversations) {
    if (!messagesByConv.has(c.id)) warnings.push(`conversation "${c.id}" has no messages and will not appear`);
  }

  // --- timing ------------------------------------------------------------
  const first = story.messages[0];
  const last = story.messages[story.messages.length - 1];
  if (last.revealAtMs > durationMs - TAIL_HOLD_MS) {
    errors.push(`last message reveals at ${last.revealAtMs}ms, leaving less than ${TAIL_HOLD_MS}ms to read it before the ${durationMs}ms video ends`);
  }
  if (first.revealAtMs > HOOK_WARN_MS) {
    warnings.push(`first message reveals at ${first.revealAtMs}ms; a hook usually lands within ${HOOK_WARN_MS}ms`);
  }
  if (last.revealAtMs < durationMs * 0.5) {
    warnings.push(`last message reveals at ${last.revealAtMs}ms, under half of the ${durationMs}ms runtime; consider slowing the pacing`);
  }
  if (story.messages.length < 4) {
    warnings.push('fewer than 4 messages; a hook, escalation, and ending usually need at least 4');
  }

  // --- assets (must exist on disk) ---------------------------------------
  const assetPaths = [];
  for (const c of story.contacts) if (c.avatar) assetPaths.push([`contact "${c.id}" avatar`, c.avatar]);
  if (story.localUser.avatar) assetPaths.push(['localUser avatar', story.localUser.avatar]);
  if (story.background) assetPaths.push(['background video', story.background.video]);
  if (story.audio.music) assetPaths.push(['music track', story.audio.music]);
  for (const [label, p] of assetPaths) {
    const abs = path.resolve(storyDir, p);
    if (!fs.existsSync(abs)) errors.push(`${label} not found: ${p}`);
  }

  if (!story.meta) warnings.push('no meta block; add meta.endingStyle to document the intended ending');

  return { ok: errors.length === 0, errors, warnings, story: errors.length === 0 ? story : null };
}
