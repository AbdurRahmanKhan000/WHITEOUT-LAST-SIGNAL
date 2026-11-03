import './starter.css';
import { bootstrap } from './app/bootstrap';

const canvas = document.getElementById('application-canvas') as HTMLCanvasElement | null;
if (canvas === null) {
    throw new Error('application-canvas element is missing');
}

void bootstrap(canvas).catch((error: unknown) => {
    // The bootstrap error shell already shows the failure in the page;
    // this log keeps the failure visible in the console too (FR-01).
    console.error('[whiteout] boot failed', error);
});
