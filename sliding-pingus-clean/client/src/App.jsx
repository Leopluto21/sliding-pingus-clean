import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './style.css';

const NAMES = { rocky: 'Rocky', frosty: 'Frosty', dash: 'Dash', sunny: 'Sunny' };
const COLORS = { rocky: '#ef4444', frosty: '#3b82f6', dash: '#22c55e', sunny: '#eab308' };
const PENGUINS = Object.keys(NAMES);
const ADMIN_PASSWORD = 'Leopluto_2004';
const NAME_KEY = 'sliding_pingus_name';

const socket = io('/', { transports: ['websocket', 'polling'] });

function money(n = 0) { return '$' + Number(n || 0).toFixed(2); }

function App() {
  const [state, setState] = useState(null);
  const [me, setMe] = useState(null);
  const [page, setPage] = useState(location.pathname === '/admin' ? 'admin' : 'game');
  const [name, setName] = useState(localStorage.getItem(NAME_KEY) || '');

  useEffect(() => {
    socket.on('state', setState);
    socket.on('me', setMe);
    return () => { socket.off('state'); socket.off('me'); };
  }, []);

  useEffect(() => {
    if (name.trim()) {
      localStorage.setItem(NAME_KEY, name.trim());
      socket.emit('setName', name.trim());
    }
  }, [name]);

  const currentPlayer = state?.players?.find(p => p.id === me?.id) || me;

  if (!state) return <div className="loading">Loading Sliding Pingus…</div>;
  if (!name.trim()) return <Join onJoin={setName} />;

  return (
    <main>
      <TopBar state={state} player={currentPlayer} onAdmin={() => { history.pushState(null, '', '/admin'); setPage('admin'); }} onGame={() => { history.pushState(null, '', '/'); setPage('game'); }} />
      {page === 'admin' ? <Admin state={state} /> : <Game state={state} player={currentPlayer} />}
    </main>
  );
}

function Join({ onJoin }) {
  const [v, setV] = useState('');
  return <div className="join"><div className="joinBox"><h1>Penguin Ice Race</h1><p>Virtuelles Multiplayer-Crash-Rennen. Kein Echtgeld.</p><input autoFocus placeholder="Dein Name" value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&v.trim())onJoin(v)}}/><button disabled={!v.trim()} onClick={()=>onJoin(v)}>Start Sliding — $1,000</button></div></div>;
}

function TopBar({ state, player, onAdmin, onGame }) {
  const left = Math.max(0, Math.ceil((state.bettingMs - (state.serverTime - state.phaseStart)) / 1000));
  return <header className="top"><div className="topBtns"><button onClick={onGame}>Game</button><button onClick={onAdmin}>Admin</button></div><b>Round {state.roundId}</b><span className={state.phase === 'betting' ? 'badge yellow' : state.phase === 'running' ? 'badge green' : 'badge red'}>{state.phase === 'betting' ? `${left}s BETTING` : state.phase === 'running' ? 'LIVE' : 'ENDED'}</span><b>{money(player?.balance)}</b></header>;
}

function Game({ state, player }) {
  const [amount, setAmount] = useState(50);
  const myBets = state.bets.filter(b => b.playerId === player?.id && b.roundId === state.roundId);
  return <>
    <History history={state.history}/>
    <Race state={state}/>
    <Lamps hits={player?.hits || 0}/>
    {state.phase === 'betting'
      ? <BetPanel amount={amount} setAmount={setAmount} balance={player?.balance || 0} myBets={myBets}/>
      : <CashPanel state={state} bets={myBets} balance={player?.balance || 0}/>
    }
  </>;
}

function History({ history }) {
  return <div className="history"><span>History</span>{history.map(h=><b key={h.roundId} style={{color:h.multiplier<2?'#ff5b66':h.multiplier<5?'#fbbf24':'#22c55e'}}>{h.multiplier.toFixed(2)}x</b>)}</div>;
}

function Race({ state }) {
  const max = Math.max(5, ...PENGUINS.map(p => state.multipliers[p] || 0));
  const viewMax = Math.max(5, max * 1.25);
  return <section className="race"><div className="raceHead"><b>PENGUIN ICE RACE</b><b>{state.phase === 'betting' ? 'GET READY' : state.phase === 'running' ? 'SLIDING' : 'FINISHED'}</b></div>{PENGUINS.map(p => <Lane key={p} id={p} m={state.multipliers[p] || 0} crashed={state.crashed[p]} phase={state.phase} viewMax={viewMax}/>) }<div className="scale">{[0,1,2,3,4,5].map(x=><span key={x}>{x}x</span>)}</div><div className="liveM">{PENGUINS.map(p=><span key={p} style={{borderColor:COLORS[p], color: state.crashed[p] ? '#f87171' : COLORS[p]}}>{NAMES[p][0]} {(state.multipliers[p]||0).toFixed(2)}x</span>)}</div></section>;
}

function Lane({ id, m, crashed, phase, viewMax }) {
  const x = 5 + Math.min(88, (m / viewMax) * 88);
  return <div className="lane"><span className="laneName" style={{color:COLORS[id]}}>{NAMES[id]}</span><div className="ice"><i/><i/><i/></div><div className={`penguin ${phase==='betting'?'idle':''} ${phase==='running'&&!crashed?'slide':''} ${crashed?'crashed':''}`} style={{left:`${x}%`, '--c': COLORS[id]}}><small>{m.toFixed(2)}x</small><Penguin color={COLORS[id]} sliding={phase==='running'&&!crashed}/></div>{crashed && <Bear left={x}/>}</div>;
}

function Penguin({ color, sliding }) {
  if (sliding) return <svg width="72" height="42" viewBox="0 0 100 58"><ellipse cx="45" cy="34" rx="32" ry="16" fill="#101722"/><ellipse cx="48" cy="39" rx="21" ry="9" fill="#f8fafc"/><ellipse cx="75" cy="25" rx="15" ry="14" fill="#111827"/><ellipse cx="82" cy="23" rx="5" ry="6" fill="#fff"/><circle cx="84" cy="23" r="2" fill="#111827"/><path d="M90 25 L99 29 L90 32Z" fill="#f97316"/><path d="M62 19 Q63 4 77 4 Q91 5 91 20" fill={color}/><ellipse cx="77" cy="20" rx="15" ry="2" fill={color}/><path d="M15 23 Q3 24 1 35 Q8 38 18 31Z" fill={color} opacity=".65"/></svg>;
  return <svg width="44" height="58" viewBox="0 0 64 82"><ellipse cx="32" cy="46" rx="19" ry="27" fill="#101722"/><ellipse cx="32" cy="51" rx="12" ry="18" fill="#f8fafc"/><ellipse cx="32" cy="23" rx="17" ry="17" fill="#111827"/><ellipse cx="25" cy="22" rx="6" ry="7" fill="#fff"/><ellipse cx="39" cy="22" rx="6" ry="7" fill="#fff"/><circle cx="27" cy="22" r="3" fill="#111827"/><circle cx="41" cy="22" r="3" fill="#111827"/><path d="M27 30 L32 36 L37 30Z" fill="#f97316"/><path d="M17 19 Q18 3 32 3 Q46 3 47 19" fill={color}/><ellipse cx="32" cy="20" rx="16" ry="3" fill={color}/><path d="M18 72 Q11 74 15 67 Q22 66 24 71Z" fill="#f97316"/><path d="M46 72 Q53 74 49 67 Q42 66 40 71Z" fill="#f97316"/></svg>;
}

function Bear({ left }) { return <div className="bear" style={{left:`${left}%`}}><div className="hole"/><div className="bearFace"><b>●</b><b>●</b><i/></div></div>; }

function Lamps({ hits }) { return <div className="lamps"><i className={hits>=1?'on':''}>I</i><i className={hits>=3?'on big':'big'}>III</i><i className={hits>=2?'on':''}>II</i></div>; }

function BetPanel({ amount, setAmount, balance, myBets }) {
  return <section className="panel"><div className="panelHead"><h3>Pick your Penguins</h3><b>Balance: {money(balance)}</b></div><div className="betrow"><input type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)}/>{[10,50,100,250].map(v=><button key={v} onClick={()=>setAmount(v)}>${v}</button>)}</div><div className="cards">{PENGUINS.map(p=>{const existing=myBets.find(b=>b.penguin===p);return <article key={p} style={{borderColor:existing?COLORS[p]:''}}><div className="helmet" style={{borderColor:COLORS[p], background:`linear-gradient(135deg,#111827,${COLORS[p]}88)`}}/><b>{NAMES[p]}</b><button style={{background:COLORS[p]}} disabled={Number(amount)<=0 || Number(amount)>balance} onClick={()=>socket.emit('bet',{penguin:p,amount:Number(amount)})}>{existing?`CHANGE ${money(amount)}`:`BET ${money(amount)}`}</button></article>})}</div></section>;
}

function CashPanel({ state, bets, balance }) {
  return <section className="panel"><div className="panelHead"><h3>{state.phase==='running'?'Penguins Sliding':'Round Over'}</h3><b>Balance: {money(balance)}</b></div><div className="cashgrid">{bets.length?bets.map(b=>{const m=state.multipliers[b.penguin]||0; const dead=state.crashed[b.penguin]; return <button key={b.id} className={`cash ${b.cashedOut?'ok':dead?'bad':''}`} disabled={b.cashedOut||dead||state.phase!=='running'} onClick={()=>socket.emit('cashout',b.id)}>{NAMES[b.penguin]}<br/>{b.cashedOut?`Cashed ${b.cashoutMultiplier.toFixed(2)}x = ${money(b.payout)}`:dead?'CRASHED':`Cashout ${money(b.amount*m)}`}</button>}) : <p>No bets this round</p>}</div></section>;
}

function Admin({ state }) {
  const [pw, setPw] = useState('');
  const authed = pw === ADMIN_PASSWORD;
  const players = [...state.players].sort((a,b)=>b.wagered-a.wagered);
  if (!authed) return <section className="adminLogin"><h1>Admin Dashboard</h1><input type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} autoFocus/><p>Passwort: Leopluto_2004</p></section>;
  return <section className="admin"><h1>Admin Dashboard</h1><div className="stats"><Card t="Players" v={players.length}/><Card t="Total Bets" v={state.stats.totalBets}/><Card t="Volume" v={money(state.stats.totalVolume)}/><Card t="House Profit" v={money(state.stats.houseProfit)}/></div><div className="tableWrap"><table><thead><tr><th>Player</th><th>Balance</th><th>Adjust</th><th>Wagered</th><th>Won</th><th>Lost</th><th>Net</th></tr></thead><tbody>{players.map(p=><tr key={p.id}><td>{p.name}</td><td>{money(p.balance)}</td><td><button onClick={()=>socket.emit('adminAdjust',{password:pw,playerId:p.id,amount:-50})}>−50</button><button onClick={()=>socket.emit('adminAdjust',{password:pw,playerId:p.id,amount:50})}>+50</button></td><td>{money(p.wagered)}</td><td className="ok">{money(p.won)}</td><td className="bad">{money(p.lost)}</td><td>{money(p.won-p.lost)}</td></tr>)}</tbody></table></div></section>;
}
function Card({t,v}) { return <div className="stat"><small>{t}</small><b>{v}</b></div>; }

createRoot(document.getElementById('root')).render(<App/>);
