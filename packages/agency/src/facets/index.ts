/**
 * Facet module for Agency
 *
 * Provides Agency's integration with the Latency facet composition system.
 * Re-exports core facet types and provides Agency-specific adapters.
 *
 * @module facets
 */

// Re-export types from Latency
export type {
  FacetProvider,
  FacetRequirement,
  FacetDeclaration,
  FacetRegistry,
  FacetRegistration,
  RegistrationOptions,
  BindingError,
} from '@generacy-ai/latency';

// Re-export error classes from Latency
export {
  FacetNotFoundError,
  AmbiguousFacetError,
} from '@generacy-ai/latency';

// Export Agency-specific facet utilities
export { AgencyFacetRegistry } from './registry.js';
export { FacetBinder, type FacetBindingResult } from './binder.js';
