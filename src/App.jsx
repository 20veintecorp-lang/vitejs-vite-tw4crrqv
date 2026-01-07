import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, doc, increment, serverTimestamp, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { Plus, Minus, Search, Package, Users, History, LogOut, Trash2, Edit2, Save, X, Shield, Lock, LayoutGrid, Beaker, Droplet } from 'lucide-react';

// --- CONFIGURACIÓN FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAzLAv5kZHAXPjnBpq81jotbh-Ja9CzhdY",
  authDomain: "inventario-20-veinte-v01.firebaseapp.com",
  projectId: "inventario-20-veinte-v01",
  storageBucket: "inventario-20-veinte-v01.firebasestorage.app",
  messagingSenderId: "482161227724",
  appId: "1:482161227724:web:c81e6e09f92233f26a0f69"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export default function App() {
  const [user, setUser] = useState(null); 
  const [view, setView] = useState('login'); 
  const [activeTab, setActiveTab] = useState('todos'); 
  
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [amounts, setAmounts] = useState({}); 

  // Forms
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [newItem, setNewItem] = useState({ name: '', unit: 'grs', type: 'envases' });
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'colaborador' });
  const [editItem, setEditItem] = useState(null);

  useEffect(() => { signInAnonymously(auth).catch(console.error); }, []);

  // ESCUCHAR DATOS
  useEffect(() => {
    if (!user) return;
    
    const unsubItems = onSnapshot(collection(db, "products"), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubLogs = onSnapshot(collection(db, "logs"), (snap) => {
      setLogs(snap.docs.map(d => d.data()).sort((a,b) => (b.date || 0) - (a.date || 0)).slice(0, 50));
    });

    let unsubUsers = () => {};
    if (user.role === 'admin') {
      unsubUsers = onSnapshot(collection(db, "app_users"), (snap) => {
        setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    }

    return () => { unsubItems(); unsubLogs(); unsubUsers(); };
  }, [user]);

  // LOGIN
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const q = query(collection(db, "app_users"), where("username", "==", loginForm.username));
      const snap = await getDocs(q);
      let found = null;
      snap.forEach(d => { if (d.data().password === loginForm.password) found = { id: d.id, ...d.data() }; });

      if (found) { 
        setUser(found); 
        setView('inventory'); 
      } else {
        const all = await getDocs(collection(db, "app_users"));
        if (all.empty) {
          if (confirm(`Base vacía. ¿Crear a "${loginForm.username}" como Admin Maestro?`)) {
            await addDoc(collection(db, "app_users"), { ...loginForm, role: 'admin', createdAt: serverTimestamp() });
            alert("Usuario creado. Dale a INGRESAR de nuevo.");
          }
        } else { alert("Datos incorrectos"); }
      }
    } catch (e) { alert("Error: " + e.message); }
    setLoading(false);
  };

  const canEdit = user?.role === 'admin' || user?.role === 'colaborador';

  // CREAR ITEM
  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!canEdit) return alert("No tienes permiso para crear.");
    if (!newItem.name) return;
    try {
      await addDoc(collection(db, "products"), {
        name: newItem.name, type: newItem.type, unit: newItem.unit, stock: 0
      });
      setNewItem({ name: '', unit: 'grs', type: 'envases' }); 
      alert("Ítem creado correctamente");
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (!editItem || !canEdit) return;
    try {
      await updateDoc(doc(db, "products", editItem.id), {
        name: editItem.name, type: editItem.type, unit: editItem.unit
      });
      setEditItem(null);
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleTransaction = async (item, type) => {
    if (user.role === 'invitado') return alert("Solo lectura");
    
    const amountVal = Math.abs(parseFloat(amounts[item.id] || 0));
    if (!amountVal || amountVal <= 0) return alert("Ingresa una cantidad válida");
    
    if (type === 'salida' && item.stock < amountVal) {
      return alert("¡No hay suficiente stock! Operación cancelada.");
    }

    const change = type === 'entrada' ? amountVal : -amountVal;
    try {
      await updateDoc(doc(db, "products", item.id), { stock: increment(change) });
      await addDoc(collection(db, "logs"), {
        user: user.username, role: user.role, 
        action: `${type.toUpperCase()} (${amountVal})`, 
        detail: item.name, date: serverTimestamp()
      });
      setAmounts({ ...amounts, [item.id]: '' });
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "app_users"), {
        username: newUser.username, password: newUser.password, role: newUser.role, createdAt: serverTimestamp()
      });
      setNewUser({ username: '', password: '', role: 'colaborador' });
      alert("Usuario creado");
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleDeleteUser = async (id) => {
    if (confirm("¿Borrar usuario?")) await deleteDoc(doc(db, "app_users", id));
  };

  const handleDeleteItem = async (id) => {
    if (!canEdit) return;
    if (confirm("¿Borrar producto?")) await deleteDoc(doc(db, "products", id));
  };

  // --- CORRECCIÓN DEL FILTRO ---
  // Aquí estaba el problema. Ahora usamos (i.name || "") para que si no hay nombre, no explote.
  const filteredItems = items.filter(i => 
    (activeTab === 'todos' || i.type === activeTab) && 
    (i.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!user) return (
    <div className="min-h-screen w-full bg-cream flex items-center justify-center p-6">
      <div className="bg-white/90 p-10 rounded-3xl shadow-xl w-full max-w-md border border-coffee/20 backdrop-blur-sm">
        <h1 className="font-serif text-5xl text-coffee font-bold mb-2 text-center">20 Veinte</h1>
        <p className="text-center text-coffee/60 uppercase tracking-widest text-sm mb-8">Atelier de Aromas</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input className="w-full bg-cream/30 p-4 rounded-xl text-coffee placeholder-coffee/50 outline-none focus:ring-2 ring-coffee/20" 
            placeholder="Usuario" value={loginForm.username} onChange={e=>setLoginForm({...loginForm, username: e.target.value})} />
          <input className="w-full bg-cream/30 p-4 rounded-xl text-coffee placeholder-coffee/50 outline-none focus:ring-2 ring-coffee/20" 
            type="password" placeholder="Contraseña" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password: e.target.value})} />
          <button className="w-full bg-coffee text-cream py-4 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg">
            {loading ? 'Cargando...' : 'INGRESAR'}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-cream font-sans text-coffee flex flex-col">
      <nav className="bg-coffee text-cream sticky top-0 z-40 shadow-lg w-full">
        <div className="w-full px-4 md:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cream/20 rounded-full flex items-center justify-center font-serif text-xl border border-cream/30">
              {user.username ? user.username[0].toUpperCase() : '?'}
            </div>
            <div className="leading-tight">
              <h1 className="font-serif text-lg font-bold">20 Veinte</h1>
              <span className="text-[10px] uppercase tracking-widest opacity-80 flex items-center gap-1">
                {user.role}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
             {user.role === 'admin' && <button onClick={()=>setView('users')} className={`p-2 rounded-full ${view==='users'?'bg-cream text-coffee':'hover:bg-white/10'}`}><Users size={20}/></button>}
             <button onClick={()=>setView('history')} className={`p-2 rounded-full ${view==='history'?'bg-cream text-coffee':'hover:bg-white/10'}`}><History size={20}/></button>
             <button onClick={()=>setView('inventory')} className={`p-2 rounded-full ${view==='inventory'?'bg-cream text-coffee':'hover:bg-white/10'}`}><Package size={20}/></button>
             <button onClick={()=>setUser(null)} className="p-2 hover:bg-red-500/20 text-red-200 rounded-full"><LogOut size={20}/></button>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full px-4 md:px-8 py-6">
        
        {view === 'users' && user.role === 'admin' && (
          <div className="bg-white/80 p-6 rounded-[2.5rem] shadow-sm border border-white max-w-7xl mx-auto">
            <h2 className="font-serif text-3xl font-bold mb-6 flex items-center gap-2"><Users/> Gestión de Personal</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-cream/20 p-6 rounded-3xl border border-coffee/5 h-fit">
                <h3 className="font-bold mb-4">Crear Nuevo Perfil</h3>
                <form onSubmit={handleCreateUser} className="space-y-3">
                  <input placeholder="Nombre" required className="w-full p-3 rounded-xl bg-white border-none outline-none" 
                    value={newUser.username} onChange={e=>setNewUser({...newUser, username: e.target.value})} />
                  <input placeholder="Contraseña" required className="w-full p-3 rounded-xl bg-white border-none outline-none" 
                    value={newUser.password} onChange={e=>setNewUser({...newUser, password: e.target.value})} />
                  <select className="w-full p-3 rounded-xl bg-white border-none outline-none"
                    value={newUser.role} onChange={e=>setNewUser({...newUser, role: e.target.value})}>
                    <option value="admin">Administrador</option>
                    <option value="colaborador">Colaborador</option>
                    <option value="invitado">Invitado</option>
                  </select>
                  <button className="w-full bg-coffee text-cream py-3 rounded-xl font-bold hover:scale-105 transition-transform">CREAR USUARIO</button>
                </form>
              </div>
              <div className="md:col-span-2 space-y-3">
                {usersList.map(u => (
                  <div key={u.id} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-cream/30 rounded-full text-coffee"><Lock size={18}/></div>
                      <div>
                        <p className="font-bold text-lg">{u.username}</p>
                        <p className="text-xs text-coffee/60 uppercase tracking-wider">{u.role} • Clave: {u.password}</p>
                      </div>
                    </div>
                    {u.username !== user.username && (
                      <button onClick={()=>handleDeleteUser(u.id)} className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl"><Trash2 size={20}/></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'inventory' && (
          <>
            <div className="flex justify-center gap-2 mb-6 overflow-x-auto py-2">
              {['todos', 'envases', 'esencias', 'insumos'].map(tab => (
                <button key={tab} onClick={()=>setActiveTab(tab)} 
                  className={`px-6 py-2 rounded-full capitalize font-bold transition-all shadow-sm ${activeTab===tab ? 'bg-coffee text-cream scale-105' : 'bg-white/60 text-coffee hover:bg-white'}`}>
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-8">
               <div className="relative flex-1">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-coffee/40" size={20}/>
                 <input 
                   placeholder="Buscar en inventario..." 
                   className="w-full bg-white pl-12 pr-4 py-4 rounded-3xl shadow-sm outline-none text-coffee"
                   value={searchTerm}
                   onChange={e=>setSearchTerm(e.target.value)}
                 />
               </div>
               
               {canEdit && (
                <form onSubmit={handleCreateItem} className="bg-white p-2 pl-4 rounded-3xl shadow-sm flex gap-2 items-center border border-white">
                  <span className="text-xs font-bold text-coffee/50 uppercase mr-2 hidden md:inline">Nuevo:</span>
                  <input placeholder="Nombre..." className="bg-transparent outline-none w-32 font-bold text-coffee" 
                    value={newItem.name} onChange={e=>setNewItem({...newItem, name: e.target.value})}/>
                  <select className="bg-cream/30 rounded-xl text-xs p-2 outline-none font-bold cursor-pointer"
                    value={newItem.type} onChange={e=>setNewItem({...newItem, type: e.target.value})}>
                    <option value="envases">Envase</option><option value="esencias">Esencia</option><option value="insumos">Insumo</option>
                  </select>
                  <select className="bg-cream/30 rounded-xl text-xs p-2 outline-none" 
                    value={newItem.unit} onChange={e=>setNewItem({...newItem, unit: e.target.value})}>
                    <option value="grs">grs</option><option value="ml">ml</option><option value="uds">uds</option>
                  </select>
                  <button className="bg-coffee text-cream p-3 rounded-2xl shadow-md hover:scale-105 transition-transform"><Plus size={20}/></button>
                </form>
               )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredItems.map(item => (
                <div key={item.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm relative group hover:shadow-xl transition-all border border-transparent hover:border-coffee/10">
                  
                  {editItem?.id === item.id ? (
                    <div className="space-y-3 animate-fade-in bg-cream/20 p-4 rounded-2xl">
                      <p className="text-xs font-bold uppercase text-coffee/50">Editando...</p>
                      <input className="w-full bg-white p-2 rounded-lg border border-coffee/20" value={editItem.name} onChange={e=>setEditItem({...editItem, name: e.target.value})} />
                      <div className="flex gap-2">
                        <select className="flex-1 bg-white p-2 rounded-lg border border-coffee/20" value={editItem.type} onChange={e=>setEditItem({...editItem, type: e.target.value})}>
                          <option value="envases">Envases</option><option value="esencias">Esencias</option><option value="insumos">Insumos</option>
                        </select>
                        <select className="w-20 bg-white p-2 rounded-lg border border-coffee/20" value={editItem.unit} onChange={e=>setEditItem({...editItem, unit: e.target.value})}>
                          <option value="grs">grs</option><option value="ml">ml</option><option value="uds">uds</option>
                        </select>
                      </div>
                      <div className="flex gap-2 justify-end mt-2">
                        <button onClick={()=>setEditItem(null)} className="p-2 text-red-400"><X size={20}/></button>
                        <button onClick={handleUpdateItem} className="bg-coffee text-cream px-4 py-2 rounded-lg font-bold flex gap-2 items-center"><Save size={16}/> OK</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start mb-4 pl-1">
                        <div className="flex items-center gap-2">
                          {activeTab === 'todos' && (
                             <div className="w-8 h-8 rounded-full bg-cream/30 flex items-center justify-center text-coffee/60">
                                {item.type==='esencias'?<Droplet size={16}/>:item.type==='envases'?<Package size={16}/>:<Beaker size={16}/>}
                             </div>
                          )}
                          <div>
                            <h3 className="font-serif text-xl font-bold text-coffee leading-tight">{item.name}</h3>
                            <span className="text-[10px] font-sans font-bold bg-cream/50 text-coffee px-2 py-0.5 rounded-md mt-1 inline-block uppercase tracking-wider">{item.unit}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`font-serif text-4xl font-bold block ${item.stock < 0 ? 'text-red-500' : 'text-coffee'}`}>{item.stock}</span>
                          <span className="text-[10px] text-coffee/40 uppercase tracking-widest">Total</span>
                        </div>
                      </div>

                      {user.role !== 'invitado' && (
                        <div className="bg-cream/30 p-1.5 rounded-2xl flex items-center gap-2 mt-4">
                          <input type="number" min="0" placeholder="0" className="w-20 bg-white p-3 rounded-xl text-center font-bold text-coffee outline-none focus:ring-2 ring-coffee/20"
                            value={amounts[item.id] || ''} onChange={(e) => setAmounts({...amounts, [item.id]: e.target.value})} />
                          <button onClick={()=>handleTransaction(item, 'entrada')} className="flex-1 bg-coffee text-cream py-3 rounded-xl font-bold text-xs hover:bg-opacity-90 transition-colors shadow-sm flex justify-center gap-1"><Plus size={14}/> ENTRA</button>
                          <button onClick={()=>handleTransaction(item, 'salida')} className="flex-1 bg-white border border-coffee/10 text-coffee py-3 rounded-xl font-bold text-xs hover:bg-red-50 transition-colors shadow-sm flex justify-center gap-1"><Minus size={14}/> SALE</button>
                        </div>
                      )}

                      {canEdit && (
                        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={()=>setEditItem(item)} className="p-2 bg-white text-coffee hover:bg-cream rounded-full shadow-sm" title="Editar"><Edit2 size={14}/></button>
                          <button onClick={()=>handleDeleteItem(item.id)} className="p-2 bg-white text-red-400 hover:bg-red-50 rounded-full shadow-sm" title="Eliminar"><Trash2 size={14}/></button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        
        {view === 'history' && (
          <div className="bg-white/80 p-6 rounded-3xl shadow-sm max-w-7xl mx-auto">
            <h2 className="font-serif text-3xl font-bold mb-4 flex items-center gap-2"><History/> Bitácora</h2>
            {logs.map((l,i) => (
              <div key={i} className="flex justify-between border-b border-coffee/5 py-3 text-sm">
                <div><span className="font-bold">{l.detail}</span> <span className="text-coffee/60">- {l.action}</span></div>
                <div className="text-right text-xs text-coffee/40">
                  <div>{l.user} ({l.role})</div>
                  <div>{l.date ? new Date(l.date.seconds*1000).toLocaleString() : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}