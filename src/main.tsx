import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

import { App } from './App';
import './styles.css';

const theme = createTheme({
  palette: {
    primary: { main: '#2958ff' },
    background: { default: '#f6f7fb' },
  },
  shape: { borderRadius: 6 },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
