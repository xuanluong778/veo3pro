/**
 * Production narrative spine — fixed five-beat flow (cycles when quantity > 5).
 * Each scene = one slot; partial prompts enforce one idea per JSON subject.
 */

export const SCENE_FUNCTION_FLOW = ['HOOK', 'SETUP', 'PROBLEM', 'INSIGHT', 'CONCLUSION'] as const;

export type SceneFunctionId = (typeof SCENE_FUNCTION_FLOW)[number];

const FLOW_LEN = SCENE_FUNCTION_FLOW.length;

export function sceneFunctionForIndex(index: number): SceneFunctionId {
  const i = Math.floor(Number(index));
  const safe = Number.isFinite(i) ? i : 0;
  const mod = ((safe % FLOW_LEN) + FLOW_LEN) % FLOW_LEN;
  return SCENE_FUNCTION_FLOW[mod];
}

export function sceneFunctionsForQuantity(quantity: number): SceneFunctionId[] {
  const q = Math.min(20, Math.max(1, Math.floor(Number(quantity)) || 1));
  return Array.from({ length: q }, (_, i) => sceneFunctionForIndex(i));
}

export const SCENE_FLOW_NARRATIVE_ROLES: Readonly<Record<SceneFunctionId, string>> = {
  HOOK: 'One sharp pattern-interrupt or curiosity beat — single idea.',
  SETUP: 'Establish stakes and arena; what matters — one idea only.',
  PROBLEM: 'Name the obstacle or tension clearly — one idea only.',
  INSIGHT: 'Single “aha” reframe or governing lesson — one idea only.',
  CONCLUSION: 'Landing takeaway; close the arc; no new threads — one idea only.',
};

export function formatSceneFlowGuideForSlots(sceneFunctions: readonly string[]): string {
  const lines = sceneFunctions.map((fn, i) => {
    const id = fn as SceneFunctionId;
    const role = SCENE_FLOW_NARRATIVE_ROLES[id] ?? 'One idea only; advance spine.';
    return `Scene ${i + 1} [${fn}]: ${role}`;
  });
  return ['Fixed five-beat structure (each scene exactly one slot):', ...lines].join('\n');
}
