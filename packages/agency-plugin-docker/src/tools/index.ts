/**
 * Docker plugin tools exports
 */

// Compose tools
export { composeUpTool, composeUpSchema } from './compose-up.js';
export type { ComposeUpParams } from './compose-up.js';

export { composeDownTool, composeDownSchema } from './compose-down.js';
export type { ComposeDownParams } from './compose-down.js';

export { composeLogsTool, composeLogsSchema } from './compose-logs.js';
export type { ComposeLogsParams } from './compose-logs.js';

export { composePsTool, composePsSchema } from './compose-ps.js';
export type { ComposePsParams } from './compose-ps.js';

// Container tools
export { dockerBuildTool, dockerBuildSchema } from './docker-build.js';
export type { DockerBuildParams } from './docker-build.js';

export { dockerRunTool, dockerRunSchema } from './docker-run.js';
export type { DockerRunParams } from './docker-run.js';

export { dockerStopTool, dockerStopSchema } from './docker-stop.js';
export type { DockerStopParams } from './docker-stop.js';

export { dockerExecTool, dockerExecSchema } from './docker-exec.js';
export type { DockerExecParams } from './docker-exec.js';

import type { AgencyTool } from '@generacy-ai/agency';
import { composeUpTool } from './compose-up.js';
import { composeDownTool } from './compose-down.js';
import { composeLogsTool } from './compose-logs.js';
import { composePsTool } from './compose-ps.js';
import { dockerBuildTool } from './docker-build.js';
import { dockerRunTool } from './docker-run.js';
import { dockerStopTool } from './docker-stop.js';
import { dockerExecTool } from './docker-exec.js';

/**
 * All Docker plugin tools
 */
export const dockerTools: AgencyTool[] = [
  composeUpTool,
  composeDownTool,
  composeLogsTool,
  composePsTool,
  dockerBuildTool,
  dockerRunTool,
  dockerStopTool,
  dockerExecTool,
];
