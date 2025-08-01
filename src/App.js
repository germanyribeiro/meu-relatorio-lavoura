import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'; // Importado useMemo e useCallback
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';

// Importar ícones do Lucide React
import { PlusCircle, Edit, Trash2, List, FileText, XCircle, Camera, Save, Loader2, Eye, LogIn, UserPlus, LogOut } from 'lucide-react';

// As bibliotecas jsPDF e html2canvas serão carregadas via CDN no index.html.
// Removendo os imports diretos para evitar erros de "Could not resolve" no ambiente de compilação.
// Certifique-se de adicionar as seguintes tags <script> no <head> ou no <body> do seu public/index.html:
// <script src="https://cdn.tailwindcss.com"></script>
// <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
// <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
import PropTypes from 'prop-types';

const App = () => {
  // Configurações e IDs globais do ambiente Canvas
  const currentAppId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
  
  // Usando useMemo para memorizar firebaseConfig e evitar o aviso do ESLint
  const firebaseConfig = useMemo(() => ({
    apiKey: "AIzaSyBwlHn7CommvM6psGiXjwN3AWYemiJ9uj4",
    authDomain: "lavourasapp.firebaseapp.com",
    projectId: "lavourasapp",
    storageBucket: "lavourasapp.firebasestorage.app",
    messagingSenderId: "576349607032",
    appId: "1:576349607032:web:3a36527be7aaf7ee2ec98d",
    measurementId: "G-W5CJR02XDX"
  }), []); // Array de dependências vazio para garantir que seja criado apenas uma vez

  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState('list'); // 'list', 'create', 'edit', 'view'
  const [currentReport, setCurrentReport] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false); // Estado para controlar a visibilidade do modal de fotos
  const [selectedPhoto, setSelectedPhoto] = useState(''); // Estado para a foto selecionada no modal
  const [isPdfMode, setIsPdfMode] = useState(false); // Novo estado para controlar o modo de geração de PDF
  const [loadingPdf, setLoadingPdf] = useState(false); // Movido para o componente App

  // Estados para autenticação
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isLoginView, setIsLoginView] = useState(true); // true para login, false para cadastro

  // Inicialização e Autenticação do Firebase
  useEffect(() => {
    try {
      // initialAuthToken é específico do ambiente Canvas e não deve ser usado em deploy direto.
      // A remoção da tentativa de signInWithCustomToken aqui evita o erro 'auth/custom-token-mismatch'
      // quando a aplicação é acessada fora do Canvas.
      // const initialAuthToken = typeof window.__initial_auth_token !== 'undefined' ? window.__initial_auth_token : '';

      if (!Object.keys(firebaseConfig).length) {
        throw new Error("A configuração do Firebase está faltando. Por favor, certifique-se de que __firebase_config foi fornecido.");
      }

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          // Se um usuário está logado (seja por email/senha ou token inicial válido), define o userId.
          setUserId(user.uid);
          setIsAuthReady(true);
          setLoading(false);
          setAuthMessage(''); // Limpa mensagens de autenticação ao logar
        } else {
          // Se não há usuário logado, garante que a tela de login/cadastro seja exibida.
          // Não tentamos mais signInWithCustomToken aqui para evitar o erro 'auth/custom-token-mismatch'
          // em ambientes onde o token inicial não é fornecido ou é inválido.
          setUserId(null); // Define userId como nulo para mostrar a tela de login
          setIsAuthReady(true); // Indica que a checagem de autenticação terminou
          setLoading(false);
        }
      });

      return () => unsubscribe();
    }
    catch (err) {
      console.error("Erro na inicialização do Firebase:", err);
      setError(`Erro na inicialização do Firebase: ${err.message}`);
      setLoading(false);
    }
  }, [firebaseConfig]); // firebaseConfig agora está memorizado, então esta dependência é estável

  // Busca relatórios quando a autenticação está pronta e o db está disponível
  useEffect(() => {
    if (db && userId && isAuthReady) {
      const reportsCollectionRef = collection(db, `artifacts/${currentAppId}/users/${userId}/relatoriosLavouras`);
      const q = query(reportsCollectionRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedReports = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        fetchedReports.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.dataVisita);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.dataVisita);
          return dateB - dateA;
        });
        setReports(fetchedReports);
        setLoading(false);
      }, (err) => {
        console.error("Erro ao buscar relatórios:", err);
        setError("Erro ao carregar relatórios. Por favor, recarregue a página.");
        setLoading(false);
      });

      return () => unsubscribe();
    }
  }, [db, userId, isAuthReady, currentAppId]);

  // Funções de autenticação
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthMessage('');
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setAuthMessage("Cadastro realizado com sucesso! Você está logado.");
      setEmail('');
      setPassword('');
    } catch (error) {
      console.error("Erro no cadastro:", error);
      setAuthMessage(`Erro ao cadastrar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthMessage('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setAuthMessage("Login realizado com sucesso!");
      setEmail('');
      setPassword('');
    } catch (error) {
      console.error("Erro no login:", error);
      setAuthMessage(`Erro ao fazer login: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setAuthMessage("Você foi desconectado.");
      setUserId(null); // Limpa o userId para mostrar a tela de login
      setView('list'); // Volta para a lista ao deslogar
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      setAuthMessage(`Erro ao fazer logout: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewReport = () => {
    setCurrentReport(null);
    setView('create');
  };

  const handleEditReport = (report) => {
    setCurrentReport(report);
    setView('edit');
  };

  const handleViewReport = (report) => {
    setCurrentReport(report);
    setView('view');
  };

  const handleDeleteReport = async (reportId) => {
    if (!db || !userId) return;
    if (window.confirm("Tem certeza que deseja excluir este relatório?")) {
      try {
        await deleteDoc(doc(db, `artifacts/${currentAppId}/users/${userId}/relatoriosLavouras`, reportId));
        console.log("Relatório excluído com sucesso!");
      } catch (e) {
        console.error("Erro ao excluir relatório:", e);
        setError("Erro ao excluir relatório. Por favor, tente novamente.");
      }
    }
  };

  const handleSaveReport = async (reportData) => {
    if (!db || !userId) return;
    setLoading(true);
    try {
      if (reportData.id) {
        const { id, ...dataToUpdate } = reportData;
        await updateDoc(doc(db, `artifacts/${currentAppId}/users/${userId}/relatoriosLavouras`, id), {
          ...dataToUpdate,
          updatedAt: serverTimestamp()
        });
        console.log("Relatório atualizado com sucesso!");
      } else {
        await addDoc(collection(db, `artifacts/${currentAppId}/users/${userId}/relatoriosLavouras`), {
          ...reportData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        console.log("Novo relatório adicionado com sucesso!");
      }
      setView('list');
      setCurrentReport(null);
    } catch (e) {
      console.error("Erro ao salvar relatório:", e);
      setError("Erro ao salvar relatório. Por favor, tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const generatePdfFromReportData = useCallback(async (reportData, contentRef) => {
    console.log("DEBUG: Função generatePdfFromReportData iniciada.");
    console.log("DEBUG: Tipo de setLoadingPdf (dentro de useCallback):", typeof setLoadingPdf);
    console.log("DEBUG: Tipo de setIsPdfMode (dentro de useCallback):", typeof setIsPdfMode);
    console.log("DEBUG: Tipo de setError (dentro de useCallback):", typeof setError);

    if (!contentRef.current) {
      console.error("ERRO: Conteúdo do relatório não encontrado para gerar PDF. contentRef.current é nulo.");
      setError("Erro: Não foi possível encontrar o conteúdo do relatório para gerar o PDF.");
      setLoadingPdf(false);
      return;
    }

    console.log("DEBUG: Verificando jsPDF:", typeof window.jspdf);
    console.log("DEBUG: Verificando html2canvas:", typeof window.html2canvas);

    if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
      console.error("ERRO CRÍTICO: Bibliotecas jsPDF ou html2canvas não carregadas. Verifique seu public/index.html e a conexão de internet.");
      alert("Erro: As bibliotecas de PDF (jsPDF/html2canvas) não foram carregadas. Por favor, recarregue a página, verifique sua conexão e o console do navegador.");
      setError("Erro: As bibliotecas de PDF não foram carregadas. Verifique o console do navegador.");
      setLoadingPdf(false);
      return;
    }

    setLoadingPdf(true);
    setIsPdfMode(true);
    
    setTimeout(() => {
      requestAnimationFrame(async () => {
        const screenWidth = window.innerWidth;
        const scale = screenWidth < 768 ? 1.5 : 2; 

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.overflow = 'hidden';

        const clonedContent = contentRef.current.cloneNode(true);
        tempDiv.appendChild(clonedContent);
        document.body.appendChild(tempDiv);

        try {
          console.log("DEBUG: Iniciando html2canvas...");
          const canvas = await window.html2canvas(clonedContent, { scale: scale });
          console.log("DEBUG: html2canvas concluído. Canvas gerado:", canvas);
          
          if (!canvas || canvas.width === 0 || canvas.height === 0) {
            console.error("ERRO: html2canvas gerou um canvas vazio ou inválido.");
            alert("Erro: Não foi possível gerar a imagem do relatório para o PDF. O conteúdo pode ser muito complexo ou ter elementos problemáticos.");
            setError("Erro: Falha na captura do conteúdo para PDF. Tente simplificar o relatório.");
            return;
          }

          const imgData = canvas.toDataURL('image/png');
          console.log("DEBUG: Tamanho da imgData (base64):", imgData.length);
          console.log("DEBUG: Início da imgData (base64):", imgData.substring(0, 100));

          if (!imgData || imgData.length < 1000) {
            console.error("ERRO: imgData gerada por html2canvas é muito pequena ou inválida.");
            alert("Erro: A imagem para o PDF está vazia ou corrompida. O conteúdo pode ser muito complexo ou ter elementos problemáticos.");
            setError("Erro: Imagem para PDF inválida. Tente simplificar o relatório.");
            return;
          }

          console.log("DEBUG: Iniciando jsPDF...");
          const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
          const imgWidth = 210;
          const pageHeight = 297;
          const imgHeight = canvas.height * imgWidth / canvas.width;
          let heightLeft = imgHeight;
          let position = 0;

          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;

          while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
          }

          const filename = `Relatorio_Lavoura_${reportData.propriedade.replace(/\s/g, '_')}_${reportData.dataVisita}.pdf`;
          console.log("DEBUG: PDF object criado. Tentando salvar o PDF com nome:", filename);
          pdf.save(filename);
          console.log("DEBUG: PDF salvo com sucesso (ou tentativa de download iniciada).");
        } catch (error) {
          console.error("ERRO DETALHADO DURANTE A GERAÇÃO DO PDF:", error);
          alert("Erro ao gerar PDF. Por favor, verifique o console do navegador para mais detalhes.");
          setError(`Erro ao gerar PDF: ${error.message}. Verifique o console do navegador.`);
        } finally {
          if (document.body.contains(tempDiv)) {
            document.body.removeChild(tempDiv);
            console.log("DEBUG: tempDiv removido do DOM.");
          }
          setIsPdfMode(false);
          setLoadingPdf(false);
          console.log("DEBUG: Geração de PDF finalizada (limpeza de estados).");
        }
      });
    }, 100);
  }, [setLoadingPdf, setIsPdfMode, setError]); // Dependências para useCallback

  const openPhotoModal = (photoUrl) => {
    setSelectedPhoto(photoUrl);
    setShowPhotoModal(true);
  };

  const closePhotoModal = () => {
    setShowPhotoModal(false);
    setSelectedPhoto('');
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <Loader2 className="animate-spin text-green-600 w-12 h-12" />
        <p className="ml-4 text-lg text-gray-700">Carregando aplicativo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-100 text-red-800 p-4 rounded-lg shadow-md">
        <XCircle className="w-16 h-16 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Erro!</h2>
        <p className="text-center">{error}</p>
        <p className="mt-4 text-sm">Por favor, tente recarregar a página.</p>
      </div>
    );
  }

  // Se não estiver autenticado, mostra a tela de login/cadastro
  if (!userId && isAuthReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 font-inter text-gray-800 p-4 flex items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-lg border-4 border-green-300 w-full max-w-md text-center">
          <h1 className="text-3xl font-extrabold text-green-700 mb-6">
            🌱 Relatórios de Lavouras
          </h1>
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            {isLoginView ? 'Entrar' : 'Cadastre-se'}
          </h2>
          <form onSubmit={isLoginView ? handleLogin : handleRegister} className="space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">E-mail</label>
              <input
                type="email"
                id="email"
                placeholder="Seu e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Senha</label>
              <input
                type="password"
                id="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
              />
            </div>
            {authMessage && (
              <p className={`text-sm ${authMessage.includes('Erro') ? 'text-red-600' : 'text-green-600'} mt-2`}>
                {authMessage}
              </p>
            )}
            <button
              type="submit"
              className="flex items-center justify-center w-full px-6 py-3 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition duration-300 ease-in-out transform hover:scale-105"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : (
                isLoginView ? <LogIn className="w-5 h-5 mr-2" /> : <UserPlus className="w-5 h-5 mr-2" />
              )}
              {isLoginView ? 'Entrar' : 'Cadastrar'}
            </button>
          </form>
          <button
            onClick={() => setIsLoginView(!isLoginView)}
            className="mt-4 text-blue-600 hover:underline text-sm"
          >
            {isLoginView ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Entrar'}
          </button>
        </div>
      </div>
    );
  }

  // Se autenticado, mostra o aplicativo principal
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 font-inter text-gray-800 p-4 sm:p-6 lg:p-8">
      <header className="bg-white p-4 sm:p-6 rounded-2xl shadow-lg mb-6 flex flex-col sm:flex-row items-center justify-between text-center sm:text-left">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-green-700 mb-2 sm:mb-0">
          🌱 Relatórios de Lavouras
        </h1>
        <div className="flex flex-col items-center sm:items-end">
          <span className="text-sm text-gray-600 mb-2">ID do Usuário: <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded-md break-all">{userId}</span></span>
          <div className="flex space-x-4">
            <button
              onClick={handleCreateNewReport}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-xl shadow-md hover:bg-green-700 transition duration-300 ease-in-out transform hover:scale-105"
            >
              <PlusCircle className="w-5 h-5 mr-2" />
              Novo Relatório
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-xl shadow-md hover:bg-red-700 transition duration-300 ease-in-out transform hover:scale-105"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="bg-white p-4 sm:p-6 rounded-2xl shadow-lg border-4 border-green-300">
        {view === 'list' && (
          <ReportList
            reports={reports}
            onEdit={handleEditReport}
            onDelete={handleDeleteReport}
            onNewReport={handleCreateNewReport}
            onViewReport={handleViewReport}
          />
        )}
        {(view === 'create' || view === 'edit') && (
          <ReportForm
            report={currentReport}
            onSave={handleSaveReport}
            onCancel={() => { setView('list'); setCurrentReport(null); }}
            isEditing={view === 'edit'}
            onGeneratePdf={generatePdfFromReportData}
            openPhotoModal={openPhotoModal}
            isPdfMode={isPdfMode}
            loadingPdf={loadingPdf}
            setLoadingPdf={setLoadingPdf}
          />
        )}
        {view === 'view' && currentReport && (
          <ReportView
            report={currentReport}
            onCancel={() => { setView('list'); setCurrentReport(null); }}
            onGeneratePdf={generatePdfFromReportData}
            openPhotoModal={openPhotoModal}
            isPdfMode={isPdfMode}
            loadingPdf={loadingPdf}
            setLoadingPdf={setLoadingPdf}
          />
        )}
      </main>

      {/* Modal de visualização de foto */}
      {showPhotoModal && (
        <PhotoModal imageUrl={selectedPhoto} onClose={closePhotoModal} />
      )}
    </div>
  );
};

const ReportList = ({ reports, onEdit, onDelete, onNewReport, onViewReport }) => {
  return (
    <div>
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center">
        <List className="w-6 h-6 mr-2" />
        Meus Relatórios
      </h2>
      {reports.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-xl">
          <p className="text-lg text-gray-600 mb-4">Nenhum relatório encontrado. Comece criando um novo!</p>
          <button
            onClick={onNewReport}
            className="flex items-center mx-auto px-6 py-3 bg-blue-600 text-white rounded-xl shadow-md hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105"
          >
            <PlusCircle className="w-5 h-5 mr-2" />
            Criar Primeiro Relatório
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {reports.map((report) => (
            <div key={report.id} className="bg-white p-6 rounded-xl shadow-lg border border-green-100 hover:shadow-xl transition duration-300 ease-in-out flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-semibold text-green-700 mb-2 truncate">{report.propriedade}</h3>
                <p className="text-lg font-medium text-gray-800 mb-3">{report.lavoura}</p>
                <p className="text-sm text-gray-600 mb-4">Data: {new Date(report.dataVisita).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={() => onViewReport(report)}
                  className="p-2 bg-gray-600 text-white rounded-full shadow-md hover:bg-gray-700 transition duration-200 ease-in-out transform hover:scale-110"
                  aria-label="Ver Detalhes do Relatório"
                  title="Ver Detalhes"
                >
                  <Eye className="w-5 h-5" />
                </button>
                <button
                  onClick={() => onEdit(report)}
                  className="p-2 bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700 transition duration-200 ease-in-out transform hover:scale-110"
                  aria-label="Editar Relatório"
                  title="Editar"
                >
                  <Edit className="w-5 h-5" />
                </button>
                <button
                  onClick={() => onDelete(report.id)}
                  className="p-2 bg-red-600 text-white rounded-full shadow-md hover:bg-red-700 transition duration-200 ease-in-out transform hover:scale-110"
                  aria-label="Excluir Relatório"
                  title="Excluir"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Adicionando PropTypes para ReportList
ReportList.propTypes = {
  reports: PropTypes.array.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onNewReport: PropTypes.func.isRequired,
  onViewReport: PropTypes.func.isRequired,
};

const ReportForm = ({ report, onSave, onCancel, isEditing, onGeneratePdf, openPhotoModal, isPdfMode, loadingPdf, setLoadingPdf }) => {
  const [formData, setFormData] = useState({
    propriedade: '',
    lavoura: '',
    dataVisita: new Date().toISOString().split('T')[0], // Padrão para hoje
    condicoesClimaticas: '',
    estagioFenologico: '',
    observacoesGerais: '',
    problemasIdentificados: '',
    orientacoesTecnicas: '',
    potencialProdutivo: '',
    responsavelTecnico: '', // Novo campo
    fotos: [], // Array de URLs de imagem
    ...report, // Preenche se estiver editando
  });

  const reportContentRef = useRef(null);
  const fileInputRef = useRef(null); // Referência para o input de arquivo

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Função para lidar com a seleção de arquivo
  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          fotos: [...prev.fotos, reader.result] // Adiciona a imagem como Data URL
        }));
      };
      reader.readAsDataURL(file); // Lê o arquivo como Data URL
    }
  };

  const handleRemovePhoto = (index) => {
    setFormData(prev => ({
      ...prev,
      fotos: prev.fotos.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleGeneratePdfClick = async () => {
    console.log("DEBUG: Botão Gerar PDF clicado no ReportForm.");
    setLoadingPdf(true);
    await onGeneratePdf(formData, reportContentRef);
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center">
        {isEditing ? <Edit className="w-6 h-6 mr-2" /> : <FileText className="w-6 h-6 mr-2" />}
        {isEditing ? 'Editar Relatório' : 'Novo Relatório'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div ref={reportContentRef} className="p-4 sm:p-6 md:p-12 lg:px-28 lg:py-20 border border-gray-200 rounded-xl bg-gray-50 space-y-4">
          <h3 className="text-xl font-bold text-green-700 mb-4 text-center">Informações da Visita</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="propriedade" className="block text-lg font-semibold text-gray-700 mb-1">Nome da Propriedade:</label>
              <input
                type="text"
                id="propriedade"
                name="propriedade"
                value={formData.propriedade}
                onChange={handleChange}
                required
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
              />
            </div>
            <div>
              <label htmlFor="lavoura" className="block text-lg font-semibold text-gray-700 mb-1">Nome da Lavoura:</label>
              <input
                type="text"
                id="lavoura"
                name="lavoura"
                value={formData.lavoura}
                onChange={handleChange}
                required
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
              />
            </div>
            <div>
              <label htmlFor="dataVisita" className="block text-lg font-semibold text-gray-700 mb-1">Data da Visita:</label>
              <input
                type="date"
                id="dataVisita"
                name="dataVisita"
                value={formData.dataVisita}
                onChange={handleChange}
                required
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
              />
            </div>
            <div>
              <label htmlFor="condicoesClimaticas" className="block text-lg font-semibold text-gray-700 mb-1">Condições Climáticas:</label>
              <input
                type="text"
                id="condicoesClimaticas"
                name="condicoesClimaticas"
                value={formData.condicoesClimaticas}
                onChange={handleChange}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
              />
            </div>
            <div>
              <label htmlFor="responsavelTecnico" className="block text-lg font-semibold text-gray-700 mb-1">Responsável Técnico:</label>
              <input
                type="text"
                id="responsavelTecnico"
                name="responsavelTecnico"
                value={formData.responsavelTecnico}
                onChange={handleChange}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
              />
            </div>
          </div>

          <h3 className="text-xl font-bold text-green-700 mt-6 mb-4 text-center">Observações Técnicas</h3>
          <div>
            <label htmlFor="estagioFenologico" className="block text-lg font-semibold text-gray-700 mb-1">Estágio Fenológico Observado:</label>
            <input
              type="text"
              id="estagioFenologico"
              name="estagioFenologico"
              value={formData.estagioFenologico}
              onChange={handleChange}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
            />
          </div>

          <div>
            <label htmlFor="observacoesGerais" className="block text-lg font-semibold text-gray-700 mb-1">Observações Gerais da Lavoura:</label>
            <textarea
              id="observacoesGerais"
              name="observacoesGerais"
              rows="3"
              value={formData.observacoesGerais}
              onChange={handleChange}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
            ></textarea>
          </div>

          <div>
            <label htmlFor="problemasIdentificados" className="block text-lg font-semibold text-gray-700 mb-1">Problemas Identificados (Pragas, Doenças, Daninhas, etc.):</label>
            <textarea
              id="problemasIdentificados"
              name="problemasIdentificados"
              rows="4"
              value={formData.problemasIdentificados}
              onChange={handleChange}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
            ></textarea>
          </div>

          <div>
            <label htmlFor="orientacoesTecnicas" className="block text-lg font-semibold text-gray-700 mb-1">Orientações Técnicas Fornecidas:</label>
            <textarea
              id="orientacoesTecnicas"
              name="orientacoesTecnicas"
              rows="4"
              value={formData.orientacoesTecnicas}
              onChange={handleChange}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
            ></textarea>
          </div>

          <div>
            <label htmlFor="potencialProdutivo" className="block text-lg font-semibold text-gray-700 mb-1">Padrão de Qualidade e Potencial Produtivo Estimado:</label>
            <textarea
              id="potencialProdutivo"
              name="potencialProdutivo"
              rows="3"
              value={formData.potencialProdutivo}
              onChange={handleChange}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
            ></textarea>
          </div>

          <div className="border border-gray-200 p-4 rounded-xl bg-white shadow-sm mt-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center">
              <Camera className="w-5 h-5 mr-2" />
              Fotos do Relatório
            </h3>
            {!isPdfMode && (
              <>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current.click()}
                  className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 transition duration-300 ease-in-out transform hover:scale-105 mb-4"
                >
                  <PlusCircle className="w-5 h-5 mr-2" />
                  Adicionar Foto do Dispositivo
                </button>
              </>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {formData.fotos.map((photoUrl, index) => (
                <div key={index} className="relative group rounded-lg overflow-hidden shadow-sm aspect-w-16 aspect-h-9">
                  <img
                    src={photoUrl}
                    alt={`Foto da lavoura ${index + 1}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => openPhotoModal(photoUrl)}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `https://placehold.co/150x150/cccccc/333333?text=Erro+ao+Carregar+Imagem`;
                    }}
                  />
                  {!isPdfMode && (
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(index)}
                      className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      aria-label="Remover foto"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center md:justify-end gap-4 mt-8">
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-col sm:flex-row items-center justify-center sm:justify-start px-4 py-2 sm:px-6 sm:py-3 bg-gray-500 text-white rounded-lg shadow-md hover:bg-gray-600 transition duration-300 ease-in-out text-sm sm:text-base text-center"
          >
            <XCircle className="w-5 h-5 mb-1 sm:mb-0 sm:mr-2" />
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGeneratePdfClick}
            className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105"
            disabled={loadingPdf}
          >
            {loadingPdf ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : <FileText className="w-5 h-5 mr-2" />}
            {loadingPdf ? 'Gerando PDF...' : 'Gerar PDF'}
          </button>
          <button
            type="submit"
            className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition duration-300 ease-in-out transform hover:scale-105"
          >
            <Save className="w-5 h-5 mr-2" />
            Salvar Relatório
          </button>
        </div>
      </form>
    </div>
  );
};

ReportForm.propTypes = {
  report: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  isEditing: PropTypes.bool.isRequired,
  onGeneratePdf: PropTypes.func.isRequired,
  openPhotoModal: PropTypes.func.isRequired,
  isPdfMode: PropTypes.bool.isRequired,
  loadingPdf: PropTypes.bool.isRequired,
  setLoadingPdf: PropTypes.func.isRequired,
};

const ReportView = ({ report, onCancel, onGeneratePdf, openPhotoModal, isPdfMode, loadingPdf, setLoadingPdf }) => {
  const reportContentRef = useRef(null);

  const handleGeneratePdfClick = async () => {
    setLoadingPdf(true);
    await onGeneratePdf(report, reportContentRef);
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center">
        <Eye className="w-6 h-6 mr-2" />
        Detalhes do Relatório
      </h2>
      <div ref={reportContentRef} className="p-4 sm:p-6 md:p-12 lg:px-28 lg:py-20 border border-gray-200 rounded-xl bg-gray-50 mb-6 space-y-4">
        <h3 className="text-xl font-bold text-green-700 mb-4 text-center">Informações da Visita</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-lg font-semibold text-gray-700 mb-1">Nome da Propriedade:</p>
            <p className="text-xl text-gray-900 font-semibold">{report.propriedade}</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-700 mb-1">Nome da Lavoura:</p>
            <p className="text-xl text-gray-900 font-semibold">{report.lavoura}</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-700 mb-1">Data da Visita:</p>
            <p className="text-xl text-gray-900 font-semibold">{new Date(report.dataVisita).toLocaleDateString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-700 mb-1">Condições Climáticas:</p>
            <p className="text-xl text-gray-900 font-semibold">{report.condicoesClimaticas}</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-700 mb-1">Responsável Técnico:</p>
            <p className="text-xl text-gray-900 font-semibold">{report.responsavelTecnico}</p>
          </div>
        </div>

        <h3 className="text-xl font-bold text-green-700 mt-6 mb-4 text-center">Observações Técnicas</h3>
        <div>
          <p className="text-lg font-semibold text-gray-700 mb-1">Estágio Fenológico Observado:</p>
          <p className="text-xl text-gray-900">{report.estagioFenologico}</p>
        </div>

        <div>
          <p className="text-lg font-semibold text-gray-700 mb-1">Observações Gerais da Lavoura:</p>
          <p className="text-xl text-gray-900">{report.observacoesGerais}</p>
        </div>

        <div>
          <p className="text-lg font-semibold text-gray-700 mb-1">Problemas Identificados:</p>
          <p className="text-xl text-gray-900">{report.problemasIdentificados}</p>
        </div>

        <div>
          <p className="text-lg font-semibold text-gray-700 mb-1">Orientações Técnicas Fornecidas:</p>
          <p className="text-xl text-gray-900">{report.orientacoesTecnicas}</p>
        </div>

        <div>
          <p className="text-lg font-semibold text-gray-700 mb-1">Padrão de Qualidade e Potencial Produtivo Estimado:</p>
          <p className="text-xl text-gray-900">{report.potencialProdutivo}</p>
        </div>

        {report.fotos && report.fotos.length > 0 && (
          <div className="border border-gray-200 p-4 rounded-xl bg-white shadow-sm mt-6">
            <h4 className="text-lg font-semibold text-gray-700 mb-3 flex items-center">
              <Camera className="w-5 h-5 mr-2" />
              Fotos
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {report.fotos.map((photoUrl, index) => (
                <div key={index} className="relative group rounded-lg overflow-hidden shadow-sm aspect-w-16 aspect-h-9">
                  <img
                    src={photoUrl}
                    alt={`Foto da lavoura ${index + 1}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => openPhotoModal(photoUrl)}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `https://placehold.co/150x150/cccccc/333333?text=Erro+ao+Carregar+Imagem`;
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center md:justify-end gap-4">
        <button
          onClick={onCancel}
          className="flex flex-col sm:flex-row items-center justify-center sm:justify-start px-4 py-2 sm:px-6 sm:py-3 bg-gray-500 text-white rounded-lg shadow-md hover:bg-gray-600 transition duration-300 ease-in-out text-sm sm:text-base text-center"
        >
          <XCircle className="w-5 h-5 mb-1 sm:mb-0 sm:mr-2" />
          Voltar para a Lista
        </button>
        <button
          type="button"
          onClick={handleGeneratePdfClick}
          className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105"
          disabled={loadingPdf}
        >
          {loadingPdf ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : <FileText className="w-5 h-5 mr-2" />}
          {loadingPdf ? 'Gerando PDF...' : 'Gerar PDF'}
        </button>
      </div>
    </div>
  );
};

ReportView.propTypes = {
  report: PropTypes.object.isRequired,
  onCancel: PropTypes.func.isRequired,
  onGeneratePdf: PropTypes.func.isRequired,
  openPhotoModal: PropTypes.func.isRequired,
  isPdfMode: PropTypes.bool.isRequired,
  loadingPdf: PropTypes.bool.isRequired,
  setLoadingPdf: PropTypes.func.isRequired,
};

const PhotoModal = ({ imageUrl, onClose }) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
      onClick={onClose}
    >
      <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <img
          src={imageUrl}
          alt="Visualização da Foto"
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-xl"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = `https://placehold.co/600x400/cccccc/333333?text=Erro+ao+Carregar+Imagem`;
          }}
        />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white bg-gray-800 bg-opacity-50 rounded-full p-2 hover:bg-gray-700 transition-colors duration-200"
          aria-label="Fechar"
        >
          <XCircle className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
};

PhotoModal.propTypes = {
  imageUrl: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default App;
