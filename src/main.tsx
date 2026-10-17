import { initBrowserShim } from '@/lib/browser-shim';

// Initialize the chrome/browser API shim before rendering components
initBrowserShim();

import { render } from 'preact';
import '@/ui/ui.css';
import { RootApp } from './App';

render(<RootApp />, document.getElementById('app')!);
