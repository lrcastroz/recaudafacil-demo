import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { HomePage } from './HomePage';
import { KioskPage } from './kiosk/KioskPage';
import { SimulatorPage } from './simulator/SimulatorPage';
import { AdminApp } from './admin/AdminApp';
import { WebPayPage } from './webpay/WebPayPage';
import { GatewayPage } from './webpay/GatewayPage';
import { ResultPage } from './webpay/ResultPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/simulator" element={<SimulatorPage />} />
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/pagos" element={<WebPayPage />} />
        <Route path="/pagos/resultado/:txId" element={<ResultPage />} />
        <Route path="/pasarela/:sessionId" element={<GatewayPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
