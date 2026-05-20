export const CHANNELS = {
  HISTORY_LIST: 'history:list',
  HISTORY_SELECT: 'history:select',
  HISTORY_REMOVE: 'history:remove',
  HISTORY_CLEAR: 'history:clear',
  HISTORY_CLOSE: 'history:close',
  HISTORY_UPDATED: 'history:updated',
  HISTORY_GET_IMAGE: 'history:get-image',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_RESET: 'settings:reset',
  SETTINGS_UPDATED: 'settings:updated',
  MONITORING_TOGGLE: 'monitoring:toggle',
  PREVIEW_SHOW: 'preview:show',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
