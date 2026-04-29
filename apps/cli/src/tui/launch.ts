import { NativeTuiApp } from './app.js';

export async function launchTUI(): Promise<void> {
  const cwd = process.cwd();
  const projectName = cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'project';
  const app = new NativeTuiApp({
    projectRoot: cwd,
    projectName,
    branch: 'HEAD',
  });
  app.start();
}
