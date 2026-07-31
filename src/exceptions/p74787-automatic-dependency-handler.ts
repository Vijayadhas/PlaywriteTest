import type { OcaEngine } from '../automation/oca-engine';
import type { ComponentInstruction } from '../models/component-instruction';
import type { ComponentExceptionHandler } from './exception-registry';

/** P74787-B21 is recalculated by OCA; it is verification-only and never modified. */
export class P74787AutomaticDependencyHandler implements ComponentExceptionHandler {
  supports(instruction: ComponentInstruction): boolean {
    return instruction.productNumber?.toUpperCase() === 'P74787-B21';
  }
  async execute(engine: OcaEngine, instruction: ComponentInstruction): Promise<void> {
    await engine.components.openSection(instruction.section);
    await engine.components.verifySelectedQuantity('P74787-B21', instruction.quantity ?? 1, instruction.description);
  }
}
