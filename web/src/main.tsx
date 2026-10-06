import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { HomePage } from './HomePage';
import { KioskPage } from './kiosk/KioskPage';
import { SimulatorPage } from './simulator/SimulatorPage';
import { AdminApp } from './admin/AdminApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/simulator" element={<SimulatorPage />} />
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
