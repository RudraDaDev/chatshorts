// JSON Schema for the story script. This is the structural contract; semantic
// rules (references, ordering, timing) live in validate.js.

const id = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,39}$', minLength: 1, maxLength: 40 };
const displayName = { type: 'string', minLength: 1, maxLength: 40 };

export const storySchema = {
  $id: 'chatshorts.story.v1',
  type: 'object',
  additionalProperties: false,
  required: ['title', 'durationSeconds', 'contacts', 'conversations', 'messages'],
  properties: {
    schemaVersion: { type: 'integer', const: 1 },
    title: { type: 'string', minLength: 1, maxLength: 120 },
    durationSeconds: { type: 'number', minimum: 10, maximum: 180 },
    theme: { enum: ['imessage'] },
    appearance: { enum: ['dark', 'light'] },
    statusTime: { type: 'string', minLength: 1, maxLength: 8 },
    localUser: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'displayName'],
      properties: { id, displayName, avatar: { type: 'string', minLength: 1 } },
    },
    contacts: {
      type: 'array', minItems: 1, maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'displayName'],
        properties: {
          id,
          displayName,
          avatar: { type: 'string', minLength: 1 },
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        },
      },
    },
    conversations: {
      type: 'array', minItems: 1, maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'participants', 'title'],
        properties: {
          id,
          type: { enum: ['direct', 'group'] },
          participants: { type: 'array', minItems: 1, maxItems: 8, items: id },
          title: { type: 'string', minLength: 1, maxLength: 60 },
        },
      },
    },
    messages: {
      type: 'array', minItems: 2, maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'conversationId', 'senderId', 'text', 'revealAtMs'],
        properties: {
          id,
          conversationId: id,
          senderId: id,
          text: { type: 'string', minLength: 1, maxLength: 400 },
          revealAtMs: { type: 'integer', minimum: 0, maximum: 180000 },
          timestamp: { type: 'string', minLength: 1, maxLength: 40 },
          sound: { type: 'string', minLength: 1, maxLength: 20 },
        },
      },
    },
    audio: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sfx: { type: 'boolean' },
        music: { type: ['string', 'null'] },
        musicVolumeDb: { type: 'number', minimum: -60, maximum: 0 },
      },
    },
    background: {
      type: 'object',
      additionalProperties: false,
      required: ['video'],
      properties: {
        video: { type: 'string', minLength: 1 },
        dim: { type: 'number', minimum: 0, maximum: 0.9 },
      },
    },
    meta: {
      type: 'object',
      additionalProperties: false,
      properties: {
        premise: { type: 'string', maxLength: 300 },
        genre: { type: 'string', maxLength: 40 },
        tone: { type: 'string', maxLength: 40 },
        endingStyle: { enum: ['twist', 'cliffhanger', 'resolution', 'open'] },
        language: { type: 'string', maxLength: 10 },
      },
    },
  },
};
