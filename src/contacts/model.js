import fs from 'node:fs';
import path from 'node:path';

// Contacts and conversations are separate entities. Messages reference contact
// IDs, so renaming a contact or swapping its avatar never breaks a message.

const PALETTE = ['#FF453A', '#FF9F0A', '#30D158', '#64D2FF', '#0A84FF', '#BF5AF2', '#FF375F', '#AC8E68'];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function hashString(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function initialsFor(displayName) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}

function imageAvatar(absPath) {
  const mime = MIME[path.extname(absPath).toLowerCase()];
  if (!mime) throw new Error(`unsupported avatar type: ${absPath}`);
  const data = fs.readFileSync(absPath).toString('base64');
  return { kind: 'image', src: `data:${mime};base64,${data}` };
}

/**
 * Resolve every contact (and the local user) into a display-ready record.
 * Avatars are inlined as data URLs so the browser never needs file access.
 * Contacts without an avatar get a generated initials avatar.
 */
export function resolveContacts(story, storyDir) {
  const records = new Map();
  const make = (c, fallbackKey) => {
    const avatar = c.avatar
      ? imageAvatar(path.resolve(storyDir, c.avatar))
      : { kind: 'initials', initials: initialsFor(c.displayName), color: c.color || PALETTE[hashString(fallbackKey) % PALETTE.length] };
    return { id: c.id, displayName: c.displayName, avatar };
  };
  records.set(story.localUser.id, make(story.localUser, story.localUser.id));
  for (const c of story.contacts) records.set(c.id, make(c, c.id));
  return records;
}

/**
 * Header info for each conversation: direct threads show the other person,
 * group threads show the group title and the first participant's avatar.
 */
export function resolveConversations(story, contacts) {
  const localId = story.localUser.id;
  return story.conversations.map((c) => {
    const others = c.participants.filter((p) => p !== localId).map((p) => contacts.get(p));
    const first = others[0];
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      participantIds: others.map((o) => o.id),
      header: { title: c.title, avatar: first.avatar },
      nameFor: (senderId) => contacts.get(senderId).displayName,
      avatarFor: (senderId) => contacts.get(senderId).avatar,
    };
  });
}
