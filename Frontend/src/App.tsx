import { BrowserRouter, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import './index.css';

// Deliberately minimal. This is the scaffold's front door, not Sotera's chat surface — that arrives
// with the runtime port. Kept honest rather than dressed up, so nobody mistakes a placeholder for
// a built UI.
export default function App() {
  return (
    <BrowserRouter>
      <main className="app-shell">
        <div className="app-glow app-glow-left" aria-hidden="true" />
        <div className="app-glow app-glow-right" aria-hidden="true" />

        <section className="app-frame">
          <header className="hero">
            <p className="hero-kicker">Persona</p>
            <h1>Sotera</h1>
            <p className="hero-copy">
              Scaffold only. The chat surface, memory and local model manager are not built yet.
            </p>
          </header>

          <Routes>
            <Route path="/" element={<HomePage />} />
          </Routes>
        </section>
      </main>
    </BrowserRouter>
  );
}
