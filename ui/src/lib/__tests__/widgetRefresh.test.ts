import { WIDGET_REFRESH_MINUTES, WIDGET_REFRESH_TASK, widgetRefreshAction } from '../widgetRefresh';

describe('widget refresh in the background (switch widget-background-refresh)', () => {
  it('asks iOS for the shortest wait it allows: 15 minutes', () => {
    expect(WIDGET_REFRESH_MINUTES).toBe(15);
    expect(WIDGET_REFRESH_TASK).toMatch(/^[a-z-]+$/);
  });

  it('registers on launch when on and not yet registered', () => {
    expect(widgetRefreshAction({ on: true, available: true, registered: false })).toBe('register');
  });

  it('leaves a registered task alone while on', () => {
    expect(widgetRefreshAction({ on: true, available: true, registered: true })).toBe('none');
  });

  it('unregisters when switched off', () => {
    expect(widgetRefreshAction({ on: false, available: true, registered: true })).toBe(
      'unregister'
    );
    expect(widgetRefreshAction({ on: false, available: true, registered: false })).toBe('none');
  });

  it('does nothing on a build without the modules or the widget (builds 10 to 12)', () => {
    expect(widgetRefreshAction({ on: true, available: false, registered: false })).toBe('none');
  });
});
