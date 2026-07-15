import type { ModelSpec } from './model.types';
import { dl360Gen12 } from './dl360-gen12';
import { secondCto } from './second-cto';

export const specs: ModelSpec[] = [dl360Gen12, secondCto];
