import { BrowserRouter, Routes, Route } from 'react-router-dom';

function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>Store Rating System</h1>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
