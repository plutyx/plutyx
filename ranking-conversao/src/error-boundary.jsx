import React from 'react';

export class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.warn('[GCL] Unhandled render error', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#06100d',color:'#f4fbf8',fontFamily:'Inter,system-ui,sans-serif',padding:'24px',textAlign:'center'}}>
        <div style={{fontSize:'48px',marginBottom:'16px'}}>⚠</div>
        <h1 style={{fontSize:'22px',fontWeight:800,margin:'0 0 8px'}}>Algo deu errado</h1>
        <p style={{color:'#8ca69d',maxWidth:'480px',lineHeight:1.6,margin:'0 0 20px'}}>
          A aplicação encontrou um erro inesperado. Tente recarregar a página.
        </p>
        <button
          onClick={() => location.reload()}
          style={{border:0,borderRadius:'12px',background:'linear-gradient(135deg,#b7ff6a,#78eea8)',color:'#06100d',fontWeight:800,padding:'12px 24px',cursor:'pointer',fontSize:'14px'}}
        >
          Recarregar página
        </button>
      </div>
    );
  }
}
