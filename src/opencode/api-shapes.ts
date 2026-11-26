/**
 * Runtime validation for the generated client's required payloads. These checks
 * are deliberately limited to fields the plugin reads. Extra fields and unknown
 * event types are preserved so a newer compatible service can still be recovered.
 *
 * Focused validators live in the sibling shape modules; this barrel preserves
 * the import surface used by the API wrapper and tests.
 */

export { validateModelRef } from './api-primitives';
export { validateSessionInfo, validateSessionPage, validateActiveSessions } from './session-shapes';
export { validateSessionMessage, validateMessagePage } from './message-shapes';
export { validateFileDiffs } from './diff-shapes';
export { validateAgentList, validateCommandList, validateModelList, validateSkillList } from './catalog-shapes';
export {
	validatePermissionRequest, validatePermissionList, validateFormInfo, validateFormList,
} from './interaction-shapes';
export { validateEvent, validateEventEnvelope } from './event-shapes';
