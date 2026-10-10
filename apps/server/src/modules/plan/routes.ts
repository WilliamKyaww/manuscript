import {
  generatePlanEndpoint,
  getPlanEndpoint,
  getPlanSettingsEndpoint,
  resurfaceEndpoint,
  updatePlanItemEndpoint,
  updatePlanSettingsEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { SettingsService } from '../settings/service';
import type { ResurfaceService } from './resurface';
import type { PlanService } from './service';

export function registerPlanRoutes(
  registry: ApiRegistry,
  plan: PlanService,
  settings: SettingsService,
  resurface: ResurfaceService,
): void {
  registerEndpoint(registry, resurfaceEndpoint, ({ query }) => ({
    items: resurface.upcoming(query.days),
  }));
  registerEndpoint(registry, getPlanSettingsEndpoint, () => settings.plan());
  registerEndpoint(registry, updatePlanSettingsEndpoint, ({ body }) => settings.updatePlan(body));
  registerEndpoint(registry, getPlanEndpoint, () => ({
    plan: plan.current(),
    today: plan.today(),
  }));
  registerEndpoint(registry, generatePlanEndpoint, ({ body }) => plan.generate(body.days));
  registerEndpoint(registry, updatePlanItemEndpoint, ({ params, body }) =>
    plan.setStatus(params.id, body.status),
  );
}
