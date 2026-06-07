/**
 * Production narrative spine — fixed five-beat flow (cycles when quantity > 5).
 * Each scene = one slot; partial prompts enforce one idea per JSON subject.
 */
export declare const SCENE_FUNCTION_FLOW: readonly ["HOOK", "SETUP", "PROBLEM", "INSIGHT", "CONCLUSION"];
export type SceneFunctionId = (typeof SCENE_FUNCTION_FLOW)[number];
export declare function sceneFunctionForIndex(index: number): SceneFunctionId;
export declare function sceneFunctionsForQuantity(quantity: number): SceneFunctionId[];
export declare const SCENE_FLOW_NARRATIVE_ROLES: Readonly<Record<SceneFunctionId, string>>;
export declare function formatSceneFlowGuideForSlots(sceneFunctions: readonly string[]): string;
//# sourceMappingURL=sceneFlow.d.ts.map