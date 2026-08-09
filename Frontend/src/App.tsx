import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ExampleItemsPage from './pages/ExampleItemsPage';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <main className="app-shell">
        <div className="app-glow app-glow-left" aria-hidden="true" />
        <div className="app-glow app-glow-right" aria-hidden="true" />

        <section className="app-frame">
          <header className="hero">
            <p className="hero-kicker">Fastify + React Starter</p>
            <h1>Reusable Full-Stack Template</h1>
            <p className="hero-copy">
              A generic baseline with Fastify serving the built React app, optional Sequelize setup,
              and one small example feature to replace with your real domain.
            </p>
          </header>

          <nav className="app-nav" aria-label="Primary">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'app-nav-link active' : 'app-nav-link'}>
              Overview
            </NavLink>
            <NavLink to="/items" className={({ isActive }) => isActive ? 'app-nav-link active' : 'app-nav-link'}>
              Example Items
            </NavLink>
          </nav>

          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/items" element={<ExampleItemsPage />} />
          </Routes>
        </section>
      </main>
    </BrowserRouter>
  );
}
