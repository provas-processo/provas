import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useDropzone } from 'react-dropzone';
import { 
  FolderPlus, FilePlus, ChevronLeft, File, Folder, 
  Trash2, X, FileText, Image as ImageIcon, ChevronRight, Music, Video, Loader2, CheckCircle2, UploadCloud, Lock 
} from 'lucide-react';

export default function App() {
  // --- ESTADOS DE ACESSO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const SENHA_MESTRA = import.meta.env.VITE_APP_PASSWORD;

  // --- ESTADOS DO SISTEMA ---
  const [items, setItems] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null); 
  const [currentFolderName, setCurrentFolderName] = useState('');
  // O history agora vai guardar [{id, name}, {id, name}] para montar o caminho
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState({ state: 'idle', message: '' }); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newResident, setNewResident] = useState({ nome: '', bloco: '', apto: '' });
  const [subfolderName, setSubfolderName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    if (isAuthenticated) fetchItems();
  }, [currentFolder, isAuthenticated]);

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
    } catch (error) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleLogin = (e) => {
    e.preventDefault();
    if (passwordInput === SENHA_MESTRA) {
      setIsAuthenticated(true);
    } else {
      alert("Senha incorreta!");
      setPasswordInput('');
    }
  };

  const onDropFiles = async (acceptedFiles) => {
    const filesArray = Array.from(acceptedFiles);
    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      setUploadStatus({ state: 'uploading', message: `Enviando ${file.name}...` });
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
    setUploadStatus({ state: 'success', message: 'Upload concluído com sucesso!' });
    fetchItems();
    setTimeout(() => setUploadStatus({ state: 'idle', message: '' }), 3000);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: onDropFiles, noClick: true });

  const handleDragStart = (e, itemId) => e.dataTransfer.setData("itemId", itemId);

  const handleDropOnFolder = async (e, targetFolderId) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData("itemId");
    if (itemId === targetFolderId) return;
    await supabase.from('folders_files').update({ parent_id: targetFolderId }).eq('id', itemId);
    fetchItems();
  };

  async function handleCreateFolder(e) {
    e.preventDefault();
    const folderData = currentFolder === null ? 
      { name: newResident.nome, bloco: newResident.bloco, apto: newResident.apto, is_folder: true, parent_id: currentFolder } : 
      { name: subfolderName, is_folder: true, parent_id: currentFolder };
    await supabase.from('folders_files').insert([folderData]);
    setIsModalOpen(false);
    setNewResident({ nome: '', bloco: '', apto: '' });
    setSubfolderName('');
    fetchItems();
  }

  async function deleteItem(id, isFolder, fileUrl) {
    if (!confirm("Excluir permanentemente?")) return;
    if (!isFolder && fileUrl) {
      const fileName = fileUrl.split('/').pop();
      await supabase.storage.from('provas').remove([fileName]);
    }
    await supabase.from('folders_files').delete().eq('id', id);
    fetchItems();
  }

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <ImageIcon size={60} className="text-purple-500" />;
    if (ext === 'pdf') return <FileText size={60} className="text-red-500" />;
    if (['ogg', 'mp3', 'wav', 'm4a'].includes(ext)) return <Music size={60} className="text-emerald-500" />;
    if (['mp4', 'webm', 'mov'].includes(ext)) return <Video size={60} className="text-blue-600" />;
    return <File size={60} className="text-slate-400" />;
  };

  const navigateTo = (folder) => {
    // Adiciona a pasta atual ao histórico antes de mudar
    setHistory([...history, { id: currentFolder, name: currentFolderName }]);
    setCurrentFolder(folder.id);
    const fullName = folder.bloco ? `${folder.name} - BLOCO ${folder.bloco} APTO ${folder.apto}` : folder.name;
    setCurrentFolderName(fullName);
  };

  const goBack = () => {
    const newHistory = [...history];
    const last = newHistory.pop();
    setHistory(newHistory);
    setCurrentFolder(last?.id === undefined ? null : last.id);
    setCurrentFolderName(last?.name || '');
  };

  // Função para navegar clicando direto em um nome no caminho (breadcrumbs)
  const jumpToHistory = (index) => {
    const target = history[index];
    const newHistory = history.slice(0, index);
    setHistory(newHistory);
    setCurrentFolder(target.id);
    setCurrentFolderName(target.name);
  };

  const filesOnly = items.filter(i => !i.is_folder);
  const navigateCarousel = (direction) => {
    const currentIndex = filesOnly.findIndex(f => f.id === selectedFile.id);
    let nextIndex = currentIndex + direction;
    if (nextIndex >= filesOnly.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = filesOnly.length - 1;
    setSelectedFile(filesOnly[nextIndex]);
  };

  const renderFileContent = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <img src={file.file_url} className="max-h-full max-w-full object-contain shadow-2xl" alt="Prova" />;
    if (ext === 'pdf') return <iframe src={`${file.file_url}#toolbar=0`} className="w-full h-full rounded-lg" title="PDF Preview" />;
    if (['ogg', 'mp3', 'wav', 'm4a'].includes(ext)) return (
      <div className="flex flex-col items-center gap-4 text-white">
        <Music size={100} />
        <audio controls src={file.file_url} className="w-80" autoPlay />
        <p className="font-bold">{file.name}</p>
      </div>
    );
    if (['mp4', 'webm', 'mov'].includes(ext)) return (
      <video controls className="max-h-[80vh] max-w-full shadow-2xl" autoPlay>
        <source src={file.file_url} type={`video/${ext === 'mov' ? 'mp4' : ext}`} />
      </video>
    );
    return (
      <div className="text-white text-center">
        <File size={100} className="mx-auto mb-4" />
        <p className="mb-4">Arquivo sem prévia disponível.</p>
        <div className="flex gap-4 justify-center">
          <a href={file.file_url} target="_blank" className="bg-white text-blue-900 px-6 py-2 rounded-lg font-bold">Abrir</a>
          <a href={file.file_url} download className="bg-slate-700 text-white px-6 py-2 rounded-lg font-bold">Baixar</a>
        </div>
      </div>
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-slate-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center">
          <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><Lock className="text-white" size={32} /></div>
          <h2 className="text-2xl font-black text-slate-800 mb-2 uppercase">Acesso Restrito</h2>  
          <input type="text" autoCapitalize="none" autoCorrect="off" spellCheck="false" autoFocus style={{ WebkitTextSecurity: 'disc' }} className="w-full bg-slate-100 p-4 rounded-xl mb-4 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-center" placeholder="SENHA DE ACESSO" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
          <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all">Entrar no Sistema</button>
        </form>
      </div>
    );
  }

  return (
    <div {...getRootProps()} className="min-h-screen font-sans text-slate-900 pb-20 bg-slate-50 relative">
      <input {...getInputProps()} />

      {isDragActive && (
        <div className="fixed inset-0 z-[150] bg-blue-600/90 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6">
          <UploadCloud size={120} className="animate-bounce mb-4" />
          <h2 className="text-4xl font-black uppercase tracking-tighter">Solte para Enviar</h2>
        </div>
      )}

      {uploadStatus.state !== 'idle' && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] bg-white border border-slate-200 px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5">
          {uploadStatus.state === 'uploading' ? <Loader2 className="animate-spin text-blue-600" size={24} /> : <CheckCircle2 className="text-emerald-500" size={24} />}
          <span className="font-black text-sm uppercase text-slate-700">{uploadStatus.message}</span>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 py-10 mb-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl font-black text-blue-900 tracking-tighter uppercase mb-6">Gestão de Provas</h1>
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md mx-auto">
            <button onClick={() => setIsModalOpen(true)} className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2 transition-all"><FolderPlus size={20} /> Nova Pasta</button>
            <label className="flex-1 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold cursor-pointer hover:bg-emerald-700 flex items-center justify-center gap-2 transition-all"><FilePlus size={20} /> Upload <input type="file" hidden onChange={(e) => onDropFiles(e.target.files)} /></label>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4">
        {/* BREADCRUMBS (CAMINHO WINDOWS) */}
        <div className="flex items-center mb-6 overflow-x-auto [scrollbar-width:none] whitespace-nowrap gap-2 py-2">
          {currentFolder && (
            <button onClick={goBack} className="flex items-center gap-1  font-bold hover:bg-blue-50 py-1 rounded-lg transition-all">
              <ChevronLeft size={20} /> Voltar
            </button>
          )}
          
          <button onClick={() => { setCurrentFolder(null); setHistory([]); setCurrentFolderName(''); }} className={`text-sm px-2 py-2 font-bold tracking-wider ${!currentFolder ? 'text-slate-600' : ' hover:underline'}`}>
            Inicio
          </button>

          {history.map((step, index) => step.id !== null && (
            <React.Fragment key={step.id}>
              <span className="text-slate-300">/</span>
              <button onClick={() => jumpToHistory(index)} className="text-sm font-bold  hover:underline">
                {step.name}
              </button>
            </React.Fragment>
          ))}

          {currentFolderName && (
            <>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-black text-blue-900 max-w-[200px]">
                {currentFolderName}
              </span>
            </>
          )}
        </div>

        {loading ? <div className="text-center py-24 text-slate-400 font-bold italic uppercase tracking-widest animate-pulse">Sincronizando...</div> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {items.map((item) => (
              <div key={item.id} draggable={!item.is_folder} onDragStart={(e) => handleDragStart(e, item.id)} onDragOver={(e) => item.is_folder && e.preventDefault()} onDrop={(e) => item.is_folder && handleDropOnFolder(e, item.id)} onClick={() => item.is_folder ? navigateTo(item) : setSelectedFile(item)}
                className="group relative flex flex-col items-center p-6 bg-white rounded-3xl border border-slate-200 hover:border-blue-400 hover:shadow-xl transition-all cursor-pointer">
                <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id, item.is_folder, item.file_url); }} className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1"><Trash2 size={16} /></button>
                <div className="mb-4">{item.is_folder ? <Folder size={70} className="text-amber-400 fill-amber-400" /> : getFileIcon(item.name)}</div>
                <span className="text-xs font-bold text-center line-clamp-2 text-slate-700 uppercase w-full" title={item.is_folder ? (item.bloco ? `${item.name} - BLOCO ${item.bloco} APTO ${item.apto}` : item.name) : item.name}>
                  {item.is_folder ? (item.bloco ? `${item.name} - BLOCO ${item.bloco} APTO ${item.apto}` : item.name) : item.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-blue-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-blue-600 p-6 flex justify-between text-white font-bold uppercase"><h2>{currentFolder === null ? "Pasta Morador" : "Subpasta"}</h2><button onClick={() => setIsModalOpen(false)}><X /></button></div>
            <form onSubmit={handleCreateFolder} className="p-8 flex flex-col gap-4">
              {currentFolder === null ? (<><input required className="w-full bg-slate-100 p-4 rounded-xl outline-none" value={newResident.nome} onChange={e => setNewResident({...newResident, nome: e.target.value})} placeholder="Nome" /><div className="flex gap-4"><input required className="flex-1 w-full bg-slate-100 p-4 rounded-xl outline-none" value={newResident.bloco} onChange={e => setNewResident({...newResident, bloco: e.target.value})} placeholder="Bloco" /><input required className="flex-1 w-full bg-slate-100 p-4 rounded-xl outline-none" value={newResident.apto} onChange={e => setNewResident({...newResident, apto: e.target.value})} placeholder="Apto" /></div></>) : 
              (<input required autoFocus className="w-full bg-slate-100 p-4 rounded-xl outline-none" value={subfolderName} onChange={e => setSubfolderName(e.target.value)} placeholder="Nome da subpasta" />)}
              <button className="bg-blue-600 text-white font-bold py-4 rounded-xl uppercase tracking-widest mt-2">Criar</button>
            </form>
          </div>
        </div>
      )}

      {selectedFile && (
        <div className="fixed inset-0 bg-slate-950/95 flex flex-col items-center justify-center z-[100] p-4">
          <div className="absolute top-5 right-5 flex gap-4 text-white"><button onClick={() => setSelectedFile(null)} className="hover:text-red-400 transition"><X size={40}/></button></div>
          <button onClick={() => navigateCarousel(-1)} className="absolute left-4 text-white/50 hover:text-white"><ChevronLeft size={60}/></button>
          <div className="w-full max-w-6xl h-[85vh] flex items-center justify-center">{renderFileContent(selectedFile)}</div>
          <button onClick={() => navigateCarousel(1)} className="absolute right-4 text-white/50 hover:text-white"><ChevronRight size={60}/></button>
          <div className="absolute bottom-6 text-white/70 font-bold bg-white/10 px-6 py-2 rounded-full backdrop-blur-md italic">{selectedFile.name}</div>
        </div>
      )}
    </div>
  );
}