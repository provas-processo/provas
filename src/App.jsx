import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useDropzone } from 'react-dropzone';
import { 
  FolderPlus, FilePlus, ChevronLeft, File, Folder, Home, Trash2, X, FileText, 
  Image as ImageIcon, ChevronRight, Music, Video, Loader2, CheckCircle2, 
  Lock, AlertCircle, AlertTriangle, Square, CheckSquare, Eye, EyeOff, UploadCloud,
  ListChecks
} from 'lucide-react';

export default function App() {
  // --- ESTADOS DE AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showMainPassword, setShowMainPassword] = useState(false);
  const SENHA_MESTRA = import.meta.env.VITE_APP_PASSWORD;

  // --- ESTADOS DE DADOS ---
  const [items, setItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null); 
  const [currentFolderName, setCurrentFolderName] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // --- ESTADOS DE UI / MODAIS ---
  const [uploadStatus, setUploadStatus] = useState({ state: 'idle', message: '', type: 'info' }); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showFolderPassword, setShowFolderPassword] = useState(false);
  const [customAlert, setCustomAlert] = useState({ show: false, message: '', type: 'error' });
  const [passwordGate, setPasswordGate] = useState({ show: false, folder: null, input: '', visible: false });
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, count: 0 });

  // --- ESTADOS DE CRIAÇÃO ---
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPassword, setNewFolderPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    if (isAuthenticated) fetchItems();
  }, [currentFolder, isAuthenticated]);

  // --- FUNÇÕES DE UTILIDADE ---
  const clearInputs = () => {
    setNewFolderName('');
    setNewFolderPassword('');
    setShowFolderPassword(false);
    setPasswordInput('');
    setShowMainPassword(false);
    setPasswordGate({ show: false, folder: null, input: '', visible: false });
    setDeleteConfirm({ show: false, count: 0 });
    setIsDeleting(false);
  };

  const showAlert = (message, type = 'error') => {
    setCustomAlert({ show: true, message, type });
    setTimeout(() => setCustomAlert({ show: false, message: '', type: 'error' }), 4000);
  };

  const passwordInputStyle = (isVisible) => ({
    WebkitTextSecurity: isVisible ? 'none' : 'disc'
  });

  // --- LÓGICA DE DADOS (SUPABASE) ---
  const fetchItems = async () => {
    setLoading(true);
    try {
      let query = supabase.from('folders_files').select('*');
      query = currentFolder === null ? query.is('parent_id', null) : query.eq('parent_id', currentFolder);
      const { data, error } = await query.order('is_folder', { ascending: false }).order('name', { ascending: true });
      if (error) throw error;
      setItems(data || []);
      setSelectedItems([]);
    } catch (error) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (passwordInput === SENHA_MESTRA) {
      setIsAuthenticated(true);
      clearInputs();
    } else { 
      showAlert("SENHA MESTRA INCORRETA!"); 
      setPasswordInput(''); 
    }
  };

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    
    // Logica de nomes duplicados
    let baseName = newFolderName.trim();
    let uniqueName = baseName;
    let counter = 1;
    const existingNames = items.map(i => i.name.toLowerCase());
    while (existingNames.includes(uniqueName.toLowerCase())) {
      uniqueName = `${baseName} (${counter})`;
      counter++;
    }

    const { error } = await supabase.from('folders_files').insert([{ 
      name: uniqueName, is_folder: true, parent_id: currentFolder, password: newFolderPassword || null 
    }]);

    if (error) showAlert(error.message);
    else { setIsModalOpen(false); clearInputs(); fetchItems(); }
  }

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      const itemsToDelete = items.filter(i => selectedItems.includes(i.id));
      
      for (const item of itemsToDelete) {
        if (item.is_folder) {
          // Se for pasta, busca arquivos dentro dela para limpar o Storage
          const { data: nestedFiles } = await supabase
            .from('folders_files')
            .select('file_url')
            .eq('parent_id', item.id)
            .eq('is_folder', false);

          if (nestedFiles && nestedFiles.length > 0) {
            const filesToRemove = nestedFiles.map(f => f.file_url.split('/').pop());
            await supabase.storage.from('provas').remove(filesToRemove);
          }
        } else if (item.file_url) {
          // Se for arquivo direto
          const name = item.file_url.split('/').pop();
          await supabase.storage.from('provas').remove([name]);
        }
      }

      // Exclui do banco (O Cascade no Postgres limpa as referências)
      await supabase.from('folders_files').delete().in('id', selectedItems);
      await fetchItems();
      showAlert("ITENS EXCLUÍDOS COM SUCESSO", "success");
    } catch (error) {
      showAlert("ERRO AO EXCLUIR ITENS");
    } finally {
      clearInputs();
    }
  };

  // --- CARROSSEL E NAVEGAÇÃO ---
  const navigateCarousel = useCallback((direction) => {
    if (!selectedFile) return;
    const filesOnly = items.filter(i => !i.is_folder);
    const currentIndex = filesOnly.findIndex(f => f.id === selectedFile.id);
    let nextIndex = currentIndex + direction;
    if (nextIndex >= filesOnly.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = filesOnly.length - 1;
    setSelectedFile(filesOnly[nextIndex]);
  }, [selectedFile, items]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selectedFile) {
        if (e.key === 'ArrowRight') navigateCarousel(1);
        if (e.key === 'ArrowLeft') navigateCarousel(-1);
        if (e.key === 'Escape') setSelectedFile(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, navigateCarousel]);

  // --- UPLOAD ---
  const onDropFiles = async (acceptedFiles) => {
    const filesArray = Array.from(acceptedFiles);
    for (const file of filesArray) {
      if (file.size > 50 * 1024 * 1024) {
        setUploadStatus({ state: 'error', message: `O ARQUIVO ${file.name} EXCEDE 50MB`, type: 'error' });
        setTimeout(() => setUploadStatus({ state: 'idle', message: '', type: 'info' }), 5000);
        continue;
      }
      setUploadStatus({ state: 'uploading', message: `ENVIANDO ${file.name}...`, type: 'info' });
      const cleanName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]/g, '_');
      const fileName = `${Date.now()}_${cleanName}`;
      
      const { data, error } = await supabase.storage.from('provas').upload(fileName, file);
      if (!error && data) {
        const { data: urlData } = supabase.storage.from('provas').getPublicUrl(fileName);
        await supabase.from('folders_files').insert([{ 
          name: file.name, is_folder: false, file_url: urlData.publicUrl, parent_id: currentFolder 
        }]);
      }
    }
    setUploadStatus({ state: 'success', message: 'UPLOAD CONCLUÍDO!', type: 'success' });
    setTimeout(() => setUploadStatus({ state: 'idle', message: '', type: 'info' }), 3000);
    fetchItems();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: onDropFiles, noClick: true, multiple: true });

  const checkFolderPassword = (e) => {
    e.preventDefault();
    if (passwordGate.input === passwordGate.folder.password) {
      setHistory([...history, { id: currentFolder, name: currentFolderName }]);
      setCurrentFolder(passwordGate.folder.id);
      setCurrentFolderName(passwordGate.folder.name);
      clearInputs();
    } else { showAlert("SENHA DA PASTA INCORRETA!"); }
  };

  // --- RENDERIZAÇÃO TELA DE LOGIN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4 relative">
        {customAlert.show && (
          <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[1100] bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-5">
             <AlertTriangle size={20} />
             <span className="font-bold uppercase text-sm">{customAlert.message}</span>
          </div>
        )}
        <form onSubmit={handleLogin} className="bg-slate-900 p-8 rounded-3xl shadow-2xl border border-slate-800 max-w-sm w-full text-center">
          <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><Lock className="text-white" size={32} /></div>
          <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Acesso Restrito</h2>  
          <div className="relative mb-4">
            <input 
              type="text" autoCapitalize="none" autoCorrect="off" spellCheck="false" autoFocus 
              style={passwordInputStyle(showMainPassword)}
              className="w-full bg-slate-800 text-white p-4 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-center" 
              placeholder="SENHA" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} 
            />
            <button type="button" onClick={() => setShowMainPassword(!showMainPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
              {showMainPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase hover:bg-blue-700 transition-all">Entrar</button>
        </form>
      </div>
    );
  }

  return (
    <div {...getRootProps()} className="min-h-screen font-sans text-slate-100 pb-20 bg-slate-950 relative overflow-x-hidden">
      <input {...getInputProps()} />

      {isDragActive && (
        <div className="fixed inset-0 z-[1000] bg-blue-600/90 backdrop-blur-sm flex flex-col items-center justify-center border-8 border-dashed border-white/30 m-4 rounded-[3rem] animate-in fade-in duration-200">
           <UploadCloud size={100} className="text-white mb-6 animate-bounce" />
           <h2 className="text-4xl font-black text-white uppercase tracking-tighter text-center px-4">Solte os arquivos aqui</h2>
        </div>
      )}

      {customAlert.show && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[1100] bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-5">
           <AlertTriangle size={20} />
           <span className="font-bold uppercase text-sm">{customAlert.message}</span>
        </div>
      )}

      {uploadStatus.state !== 'idle' && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[500] border px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 ${uploadStatus.type === 'error' ? 'bg-red-900 border-red-500' : 'bg-slate-900 border-slate-700'}`}>
          {uploadStatus.state === 'uploading' ? <Loader2 className="animate-spin text-blue-500" size={24} /> : <CheckCircle2 className="text-emerald-500" size={24} />}
          <span className="font-black text-sm uppercase">{uploadStatus.message}</span>
        </div>
      )}

      <header className="bg-slate-900 border-b border-slate-800 py-10 mb-10 shadow-md">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase mb-6 text-glow">Gestão de Provas</h1>
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md mx-auto mb-6">
            <button onClick={() => setIsModalOpen(true)} className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2 transition-all"><FolderPlus size={20} /> Nova Pasta</button>
            <label className="flex-1 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold cursor-pointer hover:bg-emerald-700 flex items-center justify-center gap-2 transition-all">
              <FilePlus size={20} /> Upload
              <input type="file" hidden multiple onChange={(e) => onDropFiles(e.target.files)} />
            </label>
          </div>
          <div className="flex items-center justify-center gap-2 text-amber-400 bg-amber-400/10 w-fit mx-auto px-4 py-2 rounded-full border border-amber-400/20">
            <AlertCircle size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">LIMITE DE 50 MB POR ARQUIVO</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <nav className="flex items-center bg-slate-900/50 border border-slate-800 p-2 rounded-2xl shrink-0">
              <button onClick={() => { setCurrentFolder(null); setHistory([]); setCurrentFolderName(''); }} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white"><Home size={18} /></button>
              {history.map((step, index) => step.id !== null && (
                <React.Fragment key={index}>
                  <ChevronRight size={14} className="text-slate-700 mx-1" />
                  <button onClick={() => { setHistory(history.slice(0, index)); setCurrentFolder(step.id); setCurrentFolderName(step.name); }} className="px-3 py-1.5 rounded-xl text-sm font-bold text-slate-400 hover:text-blue-400 whitespace-nowrap transition-all">{step.name}</button>
                </React.Fragment>
              ))}
              {currentFolderName && (
                <>
                  <ChevronRight size={14} className="text-slate-700 mx-1" />
                  <span className="px-3 py-1.5 rounded-xl text-sm font-black text-blue-400 bg-blue-400/10 whitespace-nowrap">{currentFolderName}</span>
                </>
              )}
            </nav>
            {items.length > 0 && (
              <button 
                onClick={() => selectedItems.length === items.length ? setSelectedItems([]) : setSelectedItems(items.map(i => i.id))}
                className={`p-3 rounded-2xl border transition-all shrink-0 ${selectedItems.length === items.length ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}
              >
                <ListChecks size={20} />
              </button>
            )}
          </div>

          {selectedItems.length > 0 && (
            <button onClick={() => setDeleteConfirm({ show: true, count: selectedItems.length })} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold animate-in zoom-in self-end md:self-auto">
              <Trash2 size={18} /> EXCLUIR ({selectedItems.length})
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 opacity-50"><Loader2 className="animate-spin text-blue-500 mb-4" size={40} /></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {items.map((item) => (
              <div key={item.id} onClick={() => {
                if(item.is_folder) {
                   if(item.password) setPasswordGate({ show: true, folder: item, input: '', visible: false });
                   else { setHistory([...history, { id: currentFolder, name: currentFolderName }]); setCurrentFolder(item.id); setCurrentFolderName(item.name); }
                } else setSelectedFile(item);
              }}
                className={`group relative flex flex-col items-center p-6 bg-slate-900 rounded-3xl border transition-all cursor-pointer ${selectedItems.includes(item.id) ? 'border-blue-500 ring-2 ring-blue-500' : 'border-slate-800 hover:border-blue-500'}`}>
                <button onClick={(e) => { e.stopPropagation(); setSelectedItems(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id]); }} 
                  className={`absolute top-4 left-4 p-1 rounded-lg z-10 ${selectedItems.includes(item.id) ? 'text-blue-500' : 'text-slate-600 opacity-0 group-hover:opacity-100'}`}>
                  {selectedItems.includes(item.id) ? <CheckSquare size={22} /> : <Square size={22}/>}
                </button>
                <div className="mb-4 relative">
                  {item.is_folder ? <><Folder size={70} className="text-amber-500 fill-amber-500/10" />{item.password && <Lock size={16} className="absolute bottom-0 right-0 text-amber-200 bg-slate-950 rounded-full p-0.5" />}</> : (
                    item.name.match(/\.(mp3|wav|ogg)$/i) ? <Music size={60} className="text-emerald-400" /> :
                    item.name.match(/\.(mp4|webm|mov)$/i) ? <Video size={60} className="text-blue-400" /> :
                    item.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? <ImageIcon size={60} className="text-purple-400" /> :
                    <File size={60} className="text-slate-500" />
                  )}
                </div>
                <span className="text-[11px] font-bold text-center line-clamp-2 text-slate-300 uppercase w-full tracking-wide">{item.name}</span>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL DE EXCLUSÃO COM LOADER */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-[1200]">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-sm text-center animate-in zoom-in-95 overflow-hidden">
            <div className="p-8">
              {isDeleting ? (
                <div className="py-4">
                  <Loader2 className="animate-spin text-red-600 mx-auto mb-6" size={50} />
                  <h2 className="text-xl font-black text-white uppercase mb-2 tracking-tighter">Excluindo...</h2>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Limpando registros e storage</p>
                </div>
              ) : (
                <>
                  <div className="bg-red-600/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle className="text-red-600" size={32} /></div>
                  <h2 className="text-xl font-black text-white uppercase mb-2 tracking-tighter">Confirmar Exclusão</h2>
                  <p className="text-slate-400 text-sm mb-8 font-bold uppercase tracking-widest leading-relaxed">Deseja excluir permanentemente {deleteConfirm.count} item(ns)?</p>
                  <div className="flex gap-4">
                    <button onClick={clearInputs} className="flex-1 bg-slate-800 text-slate-400 py-4 rounded-2xl font-bold uppercase hover:bg-slate-700 transition-all">Cancelar</button>
                    <button onClick={executeDelete} className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-red-700 transition-all">Excluir</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVA PASTA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[900]">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="bg-blue-600 p-8 flex justify-between items-center text-white font-black uppercase tracking-tighter text-xl">
              <h2>CRIAR PASTA</h2>
              <button onClick={() => { setIsModalOpen(false); clearInputs(); }}><X size={28} /></button>
            </div>
            <form onSubmit={handleCreateFolder} className="p-8 flex flex-col gap-5">
              <input required autoFocus className="w-full bg-slate-800 text-white p-5 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="NOME DA PASTA" />
              <div className="relative">
                <input 
                  type="text" autoCapitalize="none" autoCorrect="off" spellCheck="false"
                  style={passwordInputStyle(showFolderPassword)}
                  className="w-full bg-slate-800 text-white p-5 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
                  value={newFolderPassword} onChange={e => setNewFolderPassword(e.target.value)} placeholder="SENHA (OPCIONAL)" 
                />
                <button type="button" onClick={() => setShowFolderPassword(!showFolderPassword)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500">
                  {showFolderPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <button className="bg-blue-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest hover:bg-blue-700 transition-all">CRIAR AGORA</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DESBLOQUEIO DE PASTA */}
      {passwordGate.show && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 z-[950]">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-sm text-center animate-in zoom-in-95">
            <div className="p-8 flex flex-col items-center">
              <div className="bg-amber-500/10 p-4 rounded-full mb-6"><Lock className="text-amber-500" size={40} /></div>
              <h2 className="text-xl font-black text-white uppercase mb-2 tracking-tighter">PASTA PROTEGIDA</h2>
              <p className="text-slate-500 text-sm mb-8 font-bold uppercase tracking-widest truncate w-full">{passwordGate.folder.name}</p>
              <form onSubmit={checkFolderPassword} className="w-full space-y-4">
                <div className="relative">
                  <input 
                    type="text" autoCapitalize="none" autoCorrect="off" spellCheck="false" autoFocus 
                    style={passwordInputStyle(passwordGate.visible)}
                    placeholder="SENHA DA PASTA" className="w-full bg-slate-800 text-white p-5 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-center" 
                    value={passwordGate.input} onChange={e => setPasswordGate({...passwordGate, input: e.target.value})} 
                  />
                  <button type="button" onClick={() => setPasswordGate({...passwordGate, visible: !passwordGate.visible})} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500">
                    {passwordGate.visible ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <div className="flex gap-3">
                   <button type="button" onClick={clearInputs} className="flex-1 bg-slate-800 text-slate-400 py-4 rounded-2xl font-bold uppercase hover:bg-slate-700 transition-all">CANCELAR</button>
                   <button className="flex-1 bg-amber-500 text-slate-950 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-600 transition-all">ABRIR</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CARROSSEL / PREVIEW */}
      {selectedFile && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center z-[1000] p-4 animate-in fade-in duration-300">
          <button onClick={() => setSelectedFile(null)} className="absolute top-8 right-8 text-white hover:text-red-500 bg-white/5 p-3 rounded-full transition-all z-50"><X size={32}/></button>
          <button onClick={() => navigateCarousel(-1)} className="absolute left-4 md:left-10 text-white/10 hover:text-white transition-all z-50 p-4"><ChevronLeft size={60}/></button>
          <div className="w-full max-w-6xl h-[75vh] flex items-center justify-center relative">
            {selectedFile.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? <img src={selectedFile.file_url} className="max-h-full max-w-full object-contain shadow-2xl rounded-lg" /> :
             selectedFile.name.match(/\.(mp4|webm|mov)$/i) ? <video controls autoPlay className="max-h-full max-w-full shadow-2xl rounded-lg"><source src={selectedFile.file_url} /></video> :
             selectedFile.name.match(/\.(mp3|wav|ogg)$/i) ? (
               <div className="bg-slate-900 p-12 rounded-[3rem] border border-slate-800 flex flex-col items-center gap-8 shadow-2xl max-w-md w-full">
                 <div className="bg-emerald-500/10 p-8 rounded-full animate-pulse"><Music size={80} className="text-emerald-500" /></div>
                 <p className="text-slate-300 font-bold uppercase tracking-widest text-center">{selectedFile.name}</p>
                 <audio controls autoPlay className="w-full h-12" key={selectedFile.id}><source src={selectedFile.file_url} /></audio>
               </div>
             ) : <iframe src={selectedFile.file_url} className="w-full h-full bg-white rounded-2xl shadow-2xl" />}
          </div>
          <button onClick={() => navigateCarousel(1)} className="absolute right-4 md:right-10 text-white/10 hover:text-white transition-all z-50 p-4"><ChevronRight size={60}/></button>
        </div>
      )}
    </div>
  );
}