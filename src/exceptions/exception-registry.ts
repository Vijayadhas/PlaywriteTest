import type { ComponentInstruction } from '../models/component-instruction';
import type { OcaEngine } from '../automation/oca-engine';

export interface ComponentExceptionHandler {
  supports(instruction: ComponentInstruction): boolean;
  execute(engine: OcaEngine, instruction: ComponentInstruction): Promise<void>;
}

export class ExceptionRegistry {
  constructor(private readonly handlers: ComponentExceptionHandler[]) {}

  find(instruction: ComponentInstruction): ComponentExceptionHandler | undefined {
    return this.handlers.find((handler) => handler.supports(instruction));
  }
}
