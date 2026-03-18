export type CcssStyleRecipe = {
  view: string
  stateId: string
  recipeId: string
  targetClass: string
  addClasses: string[]
}

export const CCSS_RECIPE_REGISTRY: readonly CcssStyleRecipe[] = [
  {
    view: 'sample',
    stateId: 'ccss:sample:sample-panel:menu-open',
    recipeId: 'rcpDashboardStageCardMenuOpenV1',
    targetClass: 'ccss-dashboard-stage-card',
    addClasses: ['is-menu-open'],
  },
  {
    view: 'sample',
    stateId: 'ccss:sample:sample-panel:menu-open',
    recipeId: 'rcpSharedToastVisibleV1',
    targetClass: 'ccss-toast',
    addClasses: ['is-visible'],
  },
]
