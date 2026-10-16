import { render } from 'preact';
import { bootUi } from '@/ui/boot';
import '@/ui/ui.css';
import { App } from './App';

bootUi().then((settings) => {
  render(<App initial={settings} />, document.getElementById('app')!);
});
