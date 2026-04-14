/**
 * components/dispatcher.js — Route PCF type to component writer
 * Single responsibility: mapping keyword → writer function.
 * All writers have signature: (group, config) → string[]
 */

import { writePipe } from './pipe.js';
import { writeBend } from './bend.js';
import { writeTee } from './tee.js';
import { writeFlange } from './flange.js';
import { writeValve } from './valve.js';
import { writeOlet } from './olet.js';
import { writeReducerConcentric, writeReducerEccentric } from './reducer.js';
import { writeSupport } from './support.js';
import { writeGeneric } from './generic.js';
import { gate } from "../../services/gate-logger.js";
import { warn } from '../../logger.js';

const MOD = 'dispatcher';



/** Map PCF keyword → writer function */
const WRITERS = {
  'PIPE': writePipe,
  'BEND': writeBend,
  'TEE': writeTee,
  'FLANGE': writeFlange,
  'VALVE': writeValve,
  'OLET': writeOlet,
  'REDUCER-CONCENTRIC': writeReducerConcentric,
  'REDUCER-ECCENTRIC': writeReducerEccentric,
  'SUPPORT': writeSupport,
  'MISC-COMPONENT': writeGeneric,
  'COMPONENT': writeGeneric,
};

/**
 * Dispatch a ComponentGroup to the correct writer.
 * Returns [] for SKIP types or unknown types.
 * @param {object} group   - ComponentGroup
 * @param {object} config  - full config
 * @returns {string[]}
 */
export const dispatch = (group, config) => {
  if (group.skip) return [];

  const writer = WRITERS[group.pcfType];
  if (!writer) {
    warn(MOD, 'dispatch', `No writer for PCF type: "${group.pcfType}"`, {
      refno: group.refno, pcfType: group.pcfType, csvType: group.csvType,
      hint: 'Add writer to WRITERS map in dispatcher.js or mark type as SKIP in config',
    });
    return [];
  }

  try {
    gate('Dispatcher', 'dispatch', 'Dispatching to Writer', {
      refno: group.refno,
      pcfType: group.pcfType,
      writer: writer.name
    });
    return writer(group, config);
  } catch (e) {
    warn(MOD, 'dispatch', `Writer threw exception for ${group.pcfType}`, {
      refno: group.refno, error: e.message,
      stack: e.stack?.split('\n').slice(0, 3).join(' | '),
    });
    return [];
  }
};
