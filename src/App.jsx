import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useDropzone } from 'react-dropzone';
import { 
  FolderPlus, FilePlus, ChevronLeft, File, Folder, Home,
  Trash2, X, FileText, Image as ImageIcon, ChevronRight, Music, Video, Loader2, CheckCircle2, UploadCloud, Lock, AlertCircle, AlertTriangle, Square, CheckSquare
} from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const SENHA_MESTRA = import.meta.env.VITE_APP_PASSWORD;

  const [items, setItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null); 
  const [currentFolderName, setCurrentFolderName] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState({ state: 'idle', message: '', type: 'info' }); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newResident, setNewResident] = useState({ nome: '', bloco: '', apto: '' });
  const [subfolderName, setSubfolderName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    if (isAuthenticated) fetchItems();
  }, [currentFolder, isAuthenticated]);

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
      if (!selectedFile) return;
      if (e.key === 'ArrowRight') navigateCarousel(1);
      if (e.key === 'ArrowLeft') navigateCarousel(-1);
      if (e.key === 'Escape') setSelectedFile(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, navigateCarousel]);

  async function fetchItems() {
    setLoading(true);
    try {
      let query = supabase.from('folders_files').select('*');
      if (currentFolder === null) {
        query = query.is('parent_id', null);
      } else {
        query = query.eq('parent_id', currentFolder);
      }
      const { data, error } = await query.order('is_folder', { ascending: false });
      if (error) throw error;
      setItems(data || []);
      setSelectedItems([]);
    } catch (error) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleLogin = (e) => {
    e.preventDefault();
    if (passwordInput === SENHA_MESTRA) setIsAuthenticated(true);
    else { alert("Senha incorreta!"); setPasswordInput(''); }
  };

  const onDropFiles = async (acceptedFiles) => {
    const filesArray = Array.from(acceptedFiles);
    let hasError = false;

    for (const file of filesArray) {
      if (file.size > 50 * 1024 * 1024) {
        setUploadStatus({ state: 'error', message: `O arquivo ${file.name} excede o limite de 50MB`, type: 'error' });
        hasError = true;
        // Interrompe o loop ou apenas pula este arquivo, sem mostrar sucesso global
        setTimeout(() => setUploadStatus({ state: 'idle', message: '', type: 'info' }), 5000);
        continue;
      }

      setUploadStatus({ state: 'uploading', message: `Enviando ${file.name}...`, type: 'info' });
      
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

    // Só mostra sucesso se não houve erro de tamanho ou se pelo menos um arquivo subiu
    if (!hasError) {
      setUploadStatus({ state: 'success', message: 'Upload concluído com sucesso!', type: 'success' });
      setTimeout(() => setUploadStatus({ state: 'idle', message: '', type: 'info' }), 3000);
    }
    fetchItems();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: onDropFiles, noClick: true, multiple: true });

  async function handleCreateFolder(e) {
    e.preventDefault();
    const folderData = currentFolder === null ? 
      { name: newResident.nome, bloco: newResident.bloco, apto: newResident.apto, is_folder: true, parent_id: null } : 
      { name: subfolderName, is_folder: true, parent_id: currentFolder };
    await supabase.from('folders_files').insert([folderData]);
    setIsModalOpen(false);
    setNewResident({ nome: '', bloco: '', apto: '' });
    setSubfolderName('');
    fetchItems();
  }

  async function deleteSelected() {
    const count = selectedItems.length;
    if (count === 0 || !confirm(`Excluir ${count} item(ns) permanentemente?`)) return;
    setLoading(true);
    try {
      const itemsToDelete = items.filter(i => selectedItems.includes(i.id));
      for (const item of itemsToDelete) {
        if (!item.is_folder && item.file_url) {
          const fileName = item.file_url.split('/').pop();
          await supabase.storage.from('provas').remove([fileName]);
        }
      }
      const { error } = await supabase.from('folders_files').delete().in('id', selectedItems);
      if (error) throw error;
      setSelectedItems([]);
      fetchItems();
    } catch (error) {
      alert("Erro ao excluir: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <ImageIcon size={60} className="text-purple-400" />;
    if (ext === 'pdf') return <FileText size={60} className="text-red-400" />;
    if (['mp4', 'webm', 'mov'].includes(ext)) return <Video size={60} className="text-blue-400" />;
    return <File size={60} className="text-slate-500" />;
  };

  const navigateTo = (folder) => {
    if (selectedItems.length > 0) return;
    setHistory([...history, { id: currentFolder, name: currentFolderName }]);
    setCurrentFolder(folder.id);
    const fullName = folder.bloco ? `${folder.name} - BL ${folder.bloco} AP ${folder.apto}` : folder.name;
    setCurrentFolderName(fullName);
  };

  const jumpToHistory = (index) => {
    const target = history[index];
    const newHistory = history.slice(0, index);
    setHistory(newHistory);
    setCurrentFolder(target.id);
    setCurrentFolderName(target.name);
  };

  const resetToHome = () => {
    setCurrentFolder(null);
    setHistory([]);
    setCurrentFolderName('');
  };

  const renderFileContent = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <img src={file.file_url} className="max-h-full max-w-full object-contain shadow-2xl" alt="Preview" />;
    if (ext === 'pdf') return <iframe src={`${file.file_url}#toolbar=0`} className="w-full h-full rounded-lg bg-white" title="PDF Preview" />;
    if (['mp4', 'webm', 'mov'].includes(ext)) return (
      <video controls className="max-h-[80vh] max-w-full shadow-2xl" autoPlay key={file.id}><source src={file.file_url} type={`video/${ext === 'mov' ? 'mp4' : ext}`} /></video>
    );
    return <div className="text-white text-center"><File size={100} className="mx-auto mb-4" /><p>Sem prévia.</p></div>;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-slate-900 p-8 rounded-3xl shadow-2xl border border-slate-800 max-w-sm w-full text-center">
          <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><Lock className="text-white" size={32} /></div>
          <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Acesso Restrito</h2>  
          <input type="text" autoFocus style={{ WebkitTextSecurity: 'disc' }} className="w-full bg-slate-800 text-white p-4 rounded-xl mb-4 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-center" placeholder="SENHA" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
          <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-colors">Entrar</button>
        </form>
      </div>
    );
  }

  return (
    <div {...getRootProps()} className="min-h-screen font-sans text-slate-100 pb-20 bg-slate-950 relative">
      <input {...getInputProps()} multiple />

      {uploadStatus.state !== 'idle' && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] border px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 ${uploadStatus.type === 'error' ? 'bg-red-900 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-200'}`}>
          {uploadStatus.state === 'uploading' ? <Loader2 className="animate-spin text-blue-500" size={24} /> : 
           uploadStatus.state === 'error' ? <AlertTriangle className="text-red-400" size={24} /> : 
           <CheckCircle2 className="text-emerald-500" size={24} />}
          <span className="font-black text-sm uppercase">{uploadStatus.message}</span>
        </div>
      )}

      <header className="bg-slate-900 border-b border-slate-800 py-10 mb-10 shadow-md">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase mb-6 text-glow">Gestão de Provas</h1>
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md mx-auto mb-6">
            <button onClick={() => setIsModalOpen(true)} className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2 transition-all"><FolderPlus size={20} /> Nova Pasta</button>
            <label className="flex-1 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold cursor-pointer hover:bg-emerald-700 flex items-center justify-center gap-2 transition-all">
              <FilePlus size={20} /> Upload Múltiplo 
              <input type="file" hidden multiple onChange={(e) => onDropFiles(e.target.files)} />
            </label>
          </div>
          <div className="flex items-center justify-center gap-2 text-amber-400 bg-amber-400/10 w-fit mx-auto px-4 py-2 rounded-full border border-amber-400/20">
            <AlertCircle size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Limite de 50 MB por arquivo</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <nav className="flex items-center bg-slate-900/50 border border-slate-800 p-2 rounded-2xl overflow-x-auto [scrollbar-width:none] no-scrollbar">
            <button onClick={resetToHome} className="flex items-center justify-center p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all shrink-0"><Home size={18} /></button>

            {history.map((step, index) => step.id !== null && (
              <React.Fragment key={index}>
                <ChevronRight size={14} className="text-slate-700 mx-1 shrink-0" />
                <button onClick={() => jumpToHistory(index)} className="px-3 py-1.5 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-800 hover:text-blue-400 transition-all whitespace-nowrap">{step.name}</button>
              </React.Fragment>
            ))}

            {currentFolderName && (
              <>
                <ChevronRight size={14} className="text-slate-700 mx-1 shrink-0" />
                <span className="px-3 py-1.5 rounded-xl text-sm font-black text-blue-400 bg-blue-400/10 whitespace-nowrap">{currentFolderName}</span>
              </>
            )}
          </nav>

          <div className="flex items-center gap-3 self-end md:self-auto">
            {currentFolder && (
              <button onClick={() => {
                const newHistory = [...history];
                const last = newHistory.pop();
                setHistory(newHistory);
                setCurrentFolder(last?.id === undefined ? null : last.id);
                setCurrentFolderName(last?.name || '');
              }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-all"><ChevronLeft size={18} /> Voltar</button>
            )}
            {selectedItems.length > 0 && (
              <button onClick={deleteSelected} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold animate-in fade-in zoom-in">
                <Trash2 size={18} /> Excluir ({selectedItems.length})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 opacity-50">
            <Loader2 className="animate-spin text-blue-500 mb-4" size={40} />
            <span className="font-black uppercase tracking-[0.2em] text-sm text-slate-500">Sincronizando</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {items.map((item) => (
              <div key={item.id} onClick={() => item.is_folder ? navigateTo(item) : setSelectedFile(item)}
                className={`group relative flex flex-col items-center p-6 bg-slate-900 rounded-3xl border transition-all cursor-pointer ${selectedItems.includes(item.id) ? 'border-blue-500 ring-2 ring-blue-500 shadow-blue-500/10' : 'border-slate-800 hover:border-blue-500 hover:-translate-y-1'}`}>
                
                <button onClick={(e) => toggleSelect(e, item.id)} className={`absolute top-4 left-4 p-1 rounded-lg transition-all z-10 ${selectedItems.includes(item.id) ? 'text-blue-500 scale-110' : 'text-slate-600 opacity-0 group-hover:opacity-100'}`}>
                  {selectedItems.includes(item.id) ? <CheckSquare size={22} className="fill-blue-500/10" /> : <Square size={22}/>}
                </button>

                <div className="mb-4">{item.is_folder ? <Folder size={70} className="text-amber-500 fill-amber-500/10 transition-transform group-hover:scale-105" /> : getFileIcon(item.name)}</div>
                <span className="text-[11px] font-bold text-center line-clamp-2 text-slate-300 uppercase w-full leading-tight tracking-wide">
                  {item.is_folder && item.bloco ? `${item.name} - BL ${item.bloco} AP ${item.apto}` : item.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[300]">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden text-center animate-in zoom-in-95">
            <div className="bg-blue-600 p-8 flex justify-between items-center text-white font-black uppercase">
              <h2>{currentFolder === null ? "Novo Morador" : "Nova Subpasta"}</h2>
              <button onClick={() => setIsModalOpen(false)}><X size={28} /></button>
            </div>
            <form onSubmit={handleCreateFolder} className="p-8 flex flex-col gap-5">
              {currentFolder === null ? (
                <>
                  <input required className="w-full bg-slate-800 text-white p-5 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={newResident.nome} onChange={e => setNewResident({...newResident, nome: e.target.value})} placeholder="Nome do Morador" />
                  <div className="flex gap-4">
                    <input required className="flex-1 w-full bg-slate-800 text-white p-5 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={newResident.bloco} onChange={e => setNewResident({...newResident, bloco: e.target.value})} placeholder="Bloco" />
                    <input required className="flex-1 w-full bg-slate-800 text-white p-5 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={newResident.apto} onChange={e => setNewResident({...newResident, apto: e.target.value})} placeholder="Apto" />
                  </div>
                </>
              ) : (
                <input required autoFocus className="w-full bg-slate-800 text-white p-5 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={subfolderName} onChange={e => setSubfolderName(e.target.value)} placeholder="Nome da subpasta" />
              )}
              <button className="bg-blue-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest hover:bg-blue-700 transition-all">Criar</button>
            </form>
          </div>
        </div>
      )}

      {selectedFile && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl flex flex-col items-center justify-center z-[400] p-4 animate-in fade-in duration-300">
          <div className="absolute top-8 right-8 text-white z-50">
            <button onClick={() => setSelectedFile(null)} className="hover:text-red-500 transition-all bg-white/5 p-2 rounded-full"><X size={40}/></button>
          </div>
          <button onClick={() => navigateCarousel(-1)} className="absolute left-6 text-white/20 hover:text-white transition-all z-50"><ChevronLeft size={80}/></button>
          <div className="w-full max-w-5xl h-[80vh] flex items-center justify-center">
            {renderFileContent(selectedFile)}
          </div>
          <button onClick={() => navigateCarousel(1)} className="absolute right-6 text-white/20 hover:text-white transition-all z-50"><ChevronRight size={80}/></button>
          <div className="mt-8 px-6 py-2 bg-white/5 border border-white/10 rounded-full">
            <span className="text-white/60 font-black text-[10px] uppercase tracking-widest">{selectedFile.name}</span>
          </div>
        </div>
      )}
    </div>
  );
}