import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged, 
  signInWithCustomToken
} from 'firebase/auth';
import { getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';

// Importar ícones do Lucide React
// Reintroduzido 'Save' pois é utilizado no componente ReportForm.
// Removidos Share2, Mail, MessageCircle pois a funcionalidade de compartilhamento direto foi removida.
import { PlusCircle, Edit, Trash2, List, FileText, XCircle, Camera, Save, Loader2, Eye, LogIn, UserPlus, LogOut, Search, LayoutGrid, Table } from 'lucide-react'; 

import PropTypes from 'prop-types';

const App = () => {
  // Configurações e IDs globais do ambiente Canvas
  const currentAppId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
  
  // Usando useMemo para memorizar firebaseConfig e evitar o aviso do ESLint
  const firebaseConfig = useMemo(() => {
    let configToUse = null;
    // Tenta usar a configuração fornecida pelo ambiente Canvas
    if (typeof window.__firebase_config !== 'undefined' && window.__firebase_config) {
      try {
        const parsedConfig = JSON.parse(window.__firebase_config);
        // Verifica se a configuração parseada é um objeto válido e não está vazia
        if (parsedConfig && typeof parsedConfig === 'object' && Object.keys(parsedConfig).length > 0) {
          console.log("DEBUG: Tentando usar configuração do Firebase fornecida pelo ambiente Canvas.");
          configToUse = parsedConfig;
        }
      } catch (e) {
        console.error("Erro ao parsear __firebase_config:", e);
      }
    }

    // Fallback para a configuração hardcoded se __firebase_config não estiver disponível ou for inválido
    if (!configToUse) {
      console.log("DEBUG: Usando configuração do Firebase hardcoded (fallback).");
      configToUse = {
        apiKey: "AIzaSyBwlHn7CommvM6psGiXjwN3AWYemiJ9uj4", // CHAVE DE API ATUALIZADA AQUI
        authDomain: "lavourasapp.firebaseapp.com",
        projectId: "lavourasapp",
        storageBucket: "lavourasapp.firebasestorage.app",
        messagingSenderId: "576349607032",
        appId: "1:576349607032:web:3a36527be7aaf7ee2ec98d",
        measurementId: "G-W5CJR02XDX"
      };
    }
    
    console.log("DEBUG: Configuração FINAL do Firebase sendo usada:", configToUse);
    return configToUse;
  }, []);

  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState('list'); // 'list', 'create', 'edit', 'view'
  const [currentReport, setCurrentReport] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState('');
  // isPdfMode não é mais necessário para controle de estilo no HTML, mas pode ser útil para o loadingPdf
  const [isPdfMode, setIsPdfMode] = useState(false); 
  const [loadingPdf, setLoadingPdf] = useState(false);
  // shareMessage removido pois a funcionalidade de compartilhamento direto foi removida.
  // const [shareMessage, setShareMessage] = useState(null); 

  // Estados para autenticação
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isLoginView, setIsLoginView] = useState(true);

  // Inicialização e Autenticação do Firebase
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        if (!Object.keys(firebaseConfig).length) {
          throw new Error("A configuração do Firebase está faltando. Por favor, certifique-se de que __firebase_config foi fornecido.");
        }

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const firebaseAuth = getAuth(app);

        setDb(firestore);
        setAuth(firebaseAuth);
        console.log("DEBUG: Firebase App e Auth inicializados.");

        if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
          console.log("DEBUG: Tentando autenticar com token personalizado do Canvas...");
          try {
            await signInWithCustomToken(firebaseAuth, window.__initial_auth_token);
            console.log("DEBUG: Autenticado com token personalizado do Canvas com sucesso.");
          } catch (tokenError) {
            console.error("DEBUG: Erro ao autenticar com token personalizado do Canvas:", tokenError);
            setError(`Erro de autenticação inicial: ${tokenError.message}. Por favor, tente fazer login ou cadastre-se.`);
          }
        } else {
          console.log("DEBUG: Nenhum token de autenticação personalizado do Canvas encontrado. Iniciando sem autenticação.");
        }

        const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
          if (user) {
            setUserId(user.uid);
            setIsAuthReady(true);
            setLoading(false);
            setAuthMessage('');
            console.log("DEBUG: onAuthStateChanged - Usuário logado:", user.uid);
          } else {
            setUserId(null);
            setIsAuthReady(true);
            setLoading(false);
            console.log("DEBUG: onAuthStateChanged - Nenhum usuário logado.");
          }
        });

        return () => unsubscribe();
      } catch (err) {
        console.error("DEBUG: Erro na inicialização do Firebase:", err);
        setError(`Erro na inicialização do Firebase: ${err.message}`);
        setLoading(false);
      }
    };

    initializeFirebase();
  }, [firebaseConfig]);

  // Busca relatórios quando a autenticação está pronta e o db está disponível
  useEffect(() => {
    if (db && userId && isAuthReady) {
      console.log("DEBUG: Buscando relatórios para o usuário:", userId);
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
        console.log("DEBUG: Relatórios carregados com sucesso.");
      }, (err) => {
        console.error("DEBUG: Erro ao buscar relatórios:", err);
        setError("Erro ao carregar relatórios. Por favor, recarregue a página.");
        setLoading(false);
      });

      return () => unsubscribe();
    } else if (isAuthReady && !userId) {
      console.log("DEBUG: Usuário não autenticado, não buscando relatórios.");
      setLoading(false);
    }
  }, [db, userId, isAuthReady, currentAppId]);

  // Funções de autenticação
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthMessage('');
    console.log("DEBUG: Tentando cadastrar com e-mail:", email);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setAuthMessage("Cadastro realizado com sucesso! Você está logado.");
      setEmail('');
      setPassword('');
      console.log("DEBUG: Cadastro bem-sucedido.");
    } catch (error) {
      console.error("DEBUG: Erro no cadastro:", error);
      setAuthMessage(`Erro ao cadastrar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthMessage('');
    console.log("DEBUG: Tentando login com e-mail:", email);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setAuthMessage("Login realizado com sucesso!");
      setEmail('');
      setPassword('');
      console.log("DEBUG: Login bem-sucedido.");
    } catch (error) {
      console.error("DEBUG: Erro no login:", error);
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
      setUserId(null);
      setView('list');
      console.log("DEBUG: Logout bem-sucedido.");
    } catch (error) {
      console.error("DEBUG: Erro ao fazer logout:", error);
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

  // Nova função de geração de PDF baseada em texto
  const generatePdfFromReportData = useCallback(async (reportData, contentRef, setLoadingPdfFunc, setIsPdfModeFunc, setErrorFunc) => {
    console.log("DEBUG: Função generatePdfFromReportData iniciada (modo texto).");
    if (typeof window.jspdf === 'undefined') {
      console.error("ERRO CRÍTICO: Biblioteca jsPDF não carregada. Verifique seu public/index.html e a conexão de internet.");
      // Não usar alert(), mas setar um erro na UI
      setErrorFunc("Erro: A biblioteca jsPDF não foi carregada. Verifique o console do navegador.");
      setLoadingPdfFunc(false);
      return;
    }

    setLoadingPdfFunc(true);
    setIsPdfModeFunc(true); // Manter para indicar o estado de geração de PDF

    try {
      const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
      const margin = 20; // Margem de 20mm (2cm) de cada lado
      let yPos = margin; // Posição Y inicial
      const lineHeight = 4.5; // Espaçamento de linha em mm (ajustado para ser mais compacto)
      const maxLineWidth = 210 - 2 * margin; // Largura máxima da linha do texto

      const addPageIfNeeded = () => {
        if (yPos > 297 - margin) { // Se ultrapassar o limite inferior da página
          pdf.addPage();
          yPos = margin; // Resetar Y para o topo da nova página
        }
      };

      // Título Principal
      pdf.setFontSize(16); // Título do documento
      pdf.text("Relatório de Acompanhamento de Lavoura", 105, yPos, { align: 'center' });
      yPos += 10;
      addPageIfNeeded();

      // Seção: Informações da Visita
      pdf.setFontSize(11); // Títulos de seção (ajustado para 11pt)
      pdf.text("Informações da Visita", margin, yPos);
      yPos += lineHeight * 1.5;
      addPageIfNeeded();

      pdf.setFontSize(9); // Texto do corpo (ajustado para 9pt)
      const fields = [
        { label: "Nome da Propriedade:", value: reportData.propriedade },
        { label: "Nome da Lavoura:", value: reportData.lavoura },
        { label: "Data da Visita:", value: new Date(reportData.dataVisita).toLocaleDateString('pt-BR') },
        { label: "Condições Climáticas:", value: reportData.condicoesClimaticas },
        { label: "Responsável Técnico:", value: reportData.responsavelTecnico }
      ];

      fields.forEach(field => {
        const text = `${field.label} ${field.value}`;
        const splitText = pdf.splitTextToSize(text, maxLineWidth);
        pdf.text(splitText, margin, yPos);
        yPos += splitText.length * lineHeight;
        addPageIfNeeded();
      });

      yPos += lineHeight; // Espaçamento extra entre seções
      addPageIfNeeded();

      // Seção: Observações Técnicas
      pdf.setFontSize(11); // Títulos de seção (ajustado para 11pt)
      pdf.text("Observações Técnicas", margin, yPos);
      yPos += lineHeight * 1.5;
      addPageIfNeeded();

      pdf.setFontSize(9); // Texto do corpo (ajustado para 9pt)
      const obsFields = [
        { label: "Estágio Fenológico Observado:", value: reportData.estagioFenologico },
        { label: "Observações Gerais da Lavoura:", value: reportData.observacoesGerais },
        { label: "Problemas Identificados (Pragas, Doenças, Daninhas, etc.):", value: reportData.problemasIdentificados },
        { label: "Orientações Técnicas Fornecidas:", value: reportData.orientacoesTecnicas },
        { label: "Padrão de Qualidade e Potencial Produtivo Estimado:", value: reportData.potencialProdutivo }
      ];

      obsFields.forEach(field => {
        const text = `${field.label} ${field.value}`;
        const splitText = pdf.splitTextToSize(text, maxLineWidth);
        pdf.text(splitText, margin, yPos);
        yPos += splitText.length * lineHeight;
        addPageIfNeeded();
      });

      yPos += lineHeight; // Espaçamento extra entre seções
      addPageIfNeeded();

      // Seção: Fotos
      if (reportData.fotos && reportData.fotos.length > 0) {
        pdf.setFontSize(10); // Título de subseção (ajustado para 10pt)
        pdf.text("Fotos", margin, yPos);
        yPos += lineHeight * 1.5;
        addPageIfNeeded();

        const imgWidth = 20; // Largura do ícone em mm
        const imgHeight = 20; // Altura do ícone em mm
        const imgMargin = 5; // Margem entre ícones
        let currentX = margin;

        for (const photoUrl of reportData.fotos) {
          addPageIfNeeded(); // Verifica se há espaço antes de adicionar a imagem
          if (currentX + imgWidth > 210 - margin) { // Se não houver espaço na linha atual
            currentX = margin;
            yPos += imgHeight + imgMargin;
            addPageIfNeeded();
          }

          // Adicionar imagem
          try {
            pdf.addImage(photoUrl, 'PNG', currentX, yPos, imgWidth, imgHeight);
          } catch (imgError) {
            console.error("Erro ao adicionar imagem ao PDF:", imgError);
            // Opcional: Adicionar um texto de placeholder se a imagem falhar
            pdf.setFontSize(8);
            pdf.text("Erro na imagem", currentX, yPos + imgHeight / 2, { align: 'center' });
            pdf.setFontSize(9); // Resetar fonte para o corpo
          }
          currentX += imgWidth + imgMargin;
        }
        yPos += imgHeight + lineHeight; // Espaço após as fotos
        addPageIfNeeded();
      }

      const filename = `Relatorio_Lavoura_${reportData.propriedade.replace(/\s/g, '_')}_${reportData.dataVisita}.pdf`;
      pdf.save(filename);
      console.log("DEBUG: PDF salvo com sucesso (ou tentativa de download iniciada).");

    } catch (error) {
      console.error("ERRO DETALHADO DURANTE A GERAÇÃO DO PDF:", error);
      // Não usar alert(), mas setar um erro na UI
      setErrorFunc(`Erro ao gerar PDF: ${error.message}. Verifique o console do navegador.`);
    } finally {
      setLoadingPdfFunc(false);
      setIsPdfModeFunc(false);
      console.log("DEBUG: Geração de PDF finalizada (limpeza de estados).");
    }
  }, []);

  // handleShareReport removido pois a funcionalidade de compartilhamento direto foi removida.
  // const handleShareReport = useCallback(async (reportData) => {
  //   setShareMessage({
  //       type: 'prompt',
  //       text: 'Para compartilhar o PDF, primeiro clique em "Gerar PDF" para baixar o arquivo. Depois, use os links abaixo para enviar o **arquivo baixado**:',
  //       emailLink: `mailto:?subject=${encodeURIComponent(`Relatório de Lavoura: ${reportData.propriedade} - ${reportData.lavoura}`)}&body=${encodeURIComponent(`Olá,\n\nSegue o relatório de acompanhamento da lavoura ${reportData.lavoura} na propriedade ${reportData.propriedade}, visitada em ${new Date(reportData.dataVisita).toLocaleDateString('pt-BR')}.\n\nPor favor, anexe o PDF que você acabou de baixar.`)}`,
  //       whatsappLink: `https://wa.me/?text=${encodeURIComponent(`Olá! Segue o relatório de acompanhamento da lavoura ${reportData.lavoura} na propriedade ${reportData.propriedade}, visitada em ${new Date(reportData.dataVisita).toLocaleDateString('pt-BR')}. Por favor, anexe o PDF que você acabou de baixar.`)}`
  //   });
  //   setTimeout(() => setShareMessage(null), 15000);
  // }, []);

  // eslint-disable-next-line no-unused-vars
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
  if (!userId) {
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 font-inter text-gray-800 p-4 sm:p-6 lg:p-8 flex flex-col">
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

      <main className="bg-white p-4 sm:p-6 rounded-2xl shadow-lg border-4 border-green-300 flex-grow">
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
            // onShareReport removido
            isPdfMode={isPdfMode}
            loadingPdf={loadingPdf}
            setLoadingPdf={setLoadingPdf}
            setIsPdfMode={setIsPdfMode} 
            setError={setError} 
            // shareMessage removido
          />
        )}
        {view === 'view' && currentReport && (
          <ReportView
            report={currentReport}
            onCancel={() => { setView('list'); setCurrentReport(null); }}
            onGeneratePdf={generatePdfFromReportData}
            // onShareReport removido
            isPdfMode={isPdfMode}
            loadingPdf={loadingPdf}
            setLoadingPdf={setLoadingPdf}
            setIsPdfMode={setIsPdfMode} 
            setError={setError} 
            // shareMessage removido
          />
        )}
      </main>

      {/* Modal de visualização de foto */}
      {showPhotoModal && (
        <PhotoModal imageUrl={selectedPhoto} onClose={closePhotoModal} />
      )}

      {/* Rodapé */}
      <footer className="mt-6 text-center text-gray-600 text-sm">
        <p>Desenvolvido por Germany S. Ribeiro</p>
        <p>v 1.0</p>
      </footer>
    </div>
  );
};

const ReportList = ({ reports, onEdit, onDelete, onNewReport, onViewReport }) => {
  const [searchTerm, setSearchTerm] = useState('');
  // Inicializa isCardView a partir do localStorage, com fallback para true (cartões)
  const [isCardView, setIsCardView] = useState(() => {
    try {
      const storedView = localStorage.getItem('reportViewMode');
      return storedView === 'table' ? false : true; // Se for 'table', é false; caso contrário, é true (incluindo null/undefined)
    } catch (error) {
      console.error("Erro ao ler do localStorage:", error);
      return true; // Fallback para cartões em caso de erro
    }
  });

  // Efeito para salvar a preferência no localStorage sempre que isCardView mudar
  useEffect(() => {
    try {
      localStorage.setItem('reportViewMode', isCardView ? 'card' : 'table');
    } catch (error) {
      console.error("Erro ao salvar no localStorage:", error);
    }
  }, [isCardView]);

  const filteredReports = reports.filter(report => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const reportDate = new Date(report.dataVisita).toLocaleDateString('pt-BR');

    return (
      report.propriedade.toLowerCase().includes(lowerCaseSearchTerm) ||
      report.lavoura.toLowerCase().includes(lowerCaseSearchTerm) ||
      reportDate.includes(lowerCaseSearchTerm) ||
      (report.responsavelTecnico && report.responsavelTecnico.toLowerCase().includes(lowerCaseSearchTerm))
    );
  });

  return (
    <div>
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center">
        <List className="w-6 h-6 mr-2" />
        Meus Relatórios
      </h2>

      {/* Campo de filtro e botões de visualização */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 space-y-4 sm:space-y-0 sm:space-x-4">
        <div className="relative w-full sm:w-auto flex-grow">
          <input
            type="text"
            placeholder="Filtrar por propriedade, lavoura, data ou responsável"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setIsCardView(true)}
            className={`p-2 rounded-lg shadow-md transition duration-200 ease-in-out ${isCardView ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            title="Visualizar em Cartões"
          >
            <LayoutGrid className="w-6 h-6" />
          </button>
          <button
            onClick={() => setIsCardView(false)}
            className={`p-2 rounded-lg shadow-md transition duration-200 ease-in-out ${!isCardView ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            title="Visualizar em Tabela"
          >
            <Table className="w-6 h-6" />
          </button>
        </div>
      </div>

      {filteredReports.length === 0 ? (
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
        isCardView ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredReports.map((report) => (
              <div key={report.id} className="bg-white p-6 rounded-xl shadow-lg border border-green-100 hover:shadow-xl transition duration-300 ease-in-out flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-green-700 mb-2 truncate">{report.propriedade}</h3>
                  <p className="text-lg font-medium text-gray-800 mb-3">{report.lavoura}</p>
                  <p className="text-sm text-gray-600 mb-1">Data: {new Date(report.dataVisita).toLocaleDateString('pt-BR')}</p>
                  <p className="text-sm text-gray-600">Responsável: {report.responsavelTecnico || 'N/A'}</p>
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
        ) : (
          <div className="overflow-x-auto bg-white rounded-xl shadow-lg border border-green-100">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Propriedade
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lavoura
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data da Visita
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Responsável Técnico
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReports.map((report) => (
                  <tr key={report.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {report.propriedade}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {report.lavoura}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {new Date(report.dataVisita).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {report.responsavelTecnico || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
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

const ReportForm = ({ report, onSave, onCancel, isEditing, onGeneratePdf, /* onShareReport, */ /* eslint-disable-next-line no-unused-vars */ openPhotoModal, isPdfMode, loadingPdf, setLoadingPdf, setIsPdfMode, setError /*, shareMessage */ }) => { // onShareReport e shareMessage removidos
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

  // reportContentRef não é mais usado para geração de PDF, mas é mantido para o layout da tela
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
    // Passamos apenas os dados do formulário, pois a geração agora é baseada em texto
    setLoadingPdf(true); // Ativa o estado de carregamento do PDF
    await onGeneratePdf(formData, null, setLoadingPdf, setIsPdfMode, setError);
  };

  // handleShareClick removido
  // const handleShareClick = () => {
  //   onShareReport(formData); // Chama a função de compartilhamento
  // };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center">
        {isEditing ? <Edit className="w-6 h-6 mr-2" /> : <FileText className="w-6 h-6 mr-2" />}
        {isEditing ? 'Editar Relatório' : 'Novo Relatório'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* O ref reportContentRef e as classes condicionais isPdfMode não afetam mais o PDF gerado */}
        <div ref={reportContentRef} className={`
          p-4 sm:p-6
          md:p-12 lg:px-28 lg:py-20
          border border-gray-200 rounded-xl bg-gray-50 space-y-4
        `}>
          <h3 className={`text-xl font-bold text-green-700 mb-4 text-center`}>Informações da Visita</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="propriedade" className={`block font-semibold text-gray-700 mb-1 text-lg`}>Nome da Propriedade:</label>
              <input
                type="text"
                id="propriedade"
                name="propriedade"
                value={formData.propriedade}
                onChange={handleChange}
                required
                className={`mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg`}
              />
            </div>
            <div>
              <label htmlFor="lavoura" className={`block font-semibold text-gray-700 mb-1 text-lg`}>Nome da Lavoura:</label>
              <input
                type="text"
                id="lavoura"
                name="lavoura"
                value={formData.lavoura}
                onChange={handleChange}
                required
                className={`mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg`}
              />
            </div>
            <div>
              <label htmlFor="dataVisita" className={`block font-semibold text-gray-700 mb-1 text-lg`}>Data da Visita:</label>
              <input
                type="date"
                id="dataVisita"
                name="dataVisita"
                value={formData.dataVisita}
                onChange={handleChange}
                required
                className={`mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg`}
              />
            </div>
            <div>
              <label htmlFor="condicoesClimaticas" className={`block font-semibold text-gray-700 mb-1 text-lg`}>Condições Climáticas:</label>
              <input
                type="text"
                id="condicoesClimaticas"
                name="condicoesClimaticas"
                value={formData.condicoesClimaticas}
                onChange={handleChange}
                className={`mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg`}
              />
            </div>
            <div>
              <label htmlFor="responsavelTecnico" className={`block font-semibold text-gray-700 mb-1 text-lg`}>Responsável Técnico:</label>
              <input
                type="text"
                id="responsavelTecnico"
                name="responsavelTecnico"
                value={formData.responsavelTecnico}
                onChange={handleChange}
                className={`mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg`}
              />
            </div>
          </div>

          <h3 className={`text-xl font-bold text-green-700 mt-6 mb-4 text-center`}>Observações Técnicas</h3>
          <div>
            <label htmlFor="estagioFenologico" className={`block font-semibold text-gray-700 mb-1 text-lg`}>Estágio Fenológico Observado:</label>
            <input
              type="text"
              id="estagioFenologico"
              name="estagioFenologico"
              value={formData.estagioFenologico}
              onChange={handleChange}
              className={`mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg`}
            />
          </div>

          <div>
            <label htmlFor="observacoesGerais" className={`block font-semibold text-gray-700 mb-1 text-lg`}>Observações Gerais da Lavoura:</label>
            <textarea
              id="observacoesGerais"
              name="observacoesGerais"
              rows="3"
              value={formData.observacoesGerais}
              onChange={handleChange}
              className={`mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg`}
            ></textarea>
          </div>

          <div>
            <label htmlFor="problemasIdentificados" className={`block font-semibold text-gray-700 mb-1 text-lg`}>Problemas Identificados (Pragas, Doenças, Daninhas, etc.):</label>
            <textarea
              id="problemasIdentificados"
              name="problemasIdentificados"
              rows="4"
              value={formData.problemasIdentificados}
              onChange={handleChange}
              className={`mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg`}
            ></textarea>
          </div>

          <div>
            <label htmlFor="orientacoesTecnicas" className={`block font-semibold text-gray-700 mb-1 text-lg`}>Orientações Técnicas Fornecidas:</label>
            <textarea
              id="orientacoesTecnicas"
              name="orientacoesTecnicas"
              rows="4"
              value={formData.orientacoesTecnicas}
              onChange={handleChange}
              className={`mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg`}
            ></textarea>
          </div>

          <div>
            <label htmlFor="potencialProdutivo" className={`block font-semibold text-gray-700 mb-1 text-lg`}>Padrão de Qualidade e Potencial Produtivo Estimado:</label>
            <textarea
              id="potencialProdutivo"
              name="potencialProdutivo"
              rows="3"
              value={formData.potencialProdutivo}
              onChange={handleChange}
              className={`mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg`}
            ></textarea>
          </div>

          <div className="border border-gray-200 p-4 rounded-xl bg-white shadow-sm mt-6">
            <h3 className={`text-lg font-semibold text-gray-700 mb-3 flex items-center`}>
              <Camera className="w-5 h-5 mr-2" />
              Fotos do Relatório
            </h3>
            {/* isPdfMode é false aqui, então os botões aparecem */}
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
                onClick={() => fileInputRef.current.click()} // Alterado para acionar o clique do input de arquivo
                className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 transition duration-300 ease-in-out transform hover:scale-105 mb-4"
              >
                <PlusCircle className="w-5 h-5 mr-2" />
                Adicionar Foto do Dispositivo
              </button>
            </>
            <div className={`
              grid gap-4
              grid-cols-2 sm:grid-cols-3 md:grid-cols-4
            `}>
              {formData.fotos.map((photoUrl, index) => (
                <div key={index} className={`
                  relative group rounded-lg overflow-hidden shadow-sm
                  aspect-w-16 aspect-h-9
                `}>
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
                  {/* isPdfMode é false aqui, então o botão de remover aparece */}
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
                    className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    aria-label="Remover foto"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
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
            type="submit" // Alterado para type="submit" para salvar o formulário
            className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition duration-300 ease-in-out transform hover:scale-105"
          >
            <Save className="w-5 h-5 mr-2" /> {/* Ícone Save adicionado */}
            Salvar Relatório
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
          {/* Botão de Compartilhar removido */}
        </div>
        {/* Exibição da mensagem de compartilhamento removida */}
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
  // onShareReport removido
  // eslint-disable-next-line no-unused-vars
  openPhotoModal: PropTypes.func.isRequired, // Adicionado comentário para ignorar o aviso do ESLint
  isPdfMode: PropTypes.bool.isRequired,
  loadingPdf: PropTypes.bool.isRequired,
  setLoadingPdf: PropTypes.func.isRequired,
  setIsPdfMode: PropTypes.func.isRequired, 
  setError: PropTypes.func.isRequired, 
  // shareMessage removido
};

const ReportView = ({ report, onCancel, onGeneratePdf, /* onShareReport, */ /* eslint-disable-next-line no-unused-vars */ openPhotoModal, isPdfMode, loadingPdf, setLoadingPdf, setIsPdfMode, setError /*, shareMessage */ }) => { // onShareReport e shareMessage removidos
  const reportContentRef = useRef(null); // Não é mais usado para geração de PDF, mas é mantido para o layout da tela

  const handleGeneratePdfClick = async () => {
    setLoadingPdf(true); // Ativa o estado de carregamento do PDF
    await onGeneratePdf(report, null, setLoadingPdf, setIsPdfMode, setError);
  };

  // handleShareClick removido
  // const handleShareClick = () => {
  //   onShareReport(report); // Chama a função de compartilhamento
  // };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center">
        <Eye className="w-6 h-6 mr-2" />
        Detalhes do Relatório
      </h2>
      <div ref={reportContentRef} className={`
          p-4 sm:p-6
          md:p-12 lg:px-28 lg:py-20
          border border-gray-200 rounded-xl bg-gray-50 mb-6 space-y-4
        `}>
        <h3 className={`text-xl font-bold text-green-700 mb-4 text-center`}>Informações da Visita</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className={`font-semibold text-gray-700 mb-1 text-lg`}>Nome da Propriedade:</p>
            <p className={`text-gray-900 font-semibold text-xl`}>{report.propriedade}</p>
          </div>
          <div>
            <p className={`font-semibold text-gray-700 mb-1 text-lg`}>Nome da Lavoura:</p>
            <p className={`text-gray-900 font-semibold text-xl`}>{report.lavoura}</p>
          </div>
          <div>
            <p className={`font-semibold text-gray-700 mb-1 text-lg`}>Data da Visita:</p>
            <p className={`text-gray-900 font-semibold text-xl`}>{new Date(report.dataVisita).toLocaleDateString('pt-BR')}</p>
          </div>
          <div>
            <p className={`font-semibold text-gray-700 mb-1 text-lg`}>Condições Climáticas:</p>
            <p className={`text-gray-900 font-semibold text-xl`}>{report.condicoesClimaticas}</p>
          </div>
          <div>
            <p className={`font-semibold text-gray-700 mb-1 text-lg`}>Responsável Técnico:</p>
            <p className={`text-gray-900 font-semibold text-xl`}>{report.responsavelTecnico}</p>
          </div>
        </div>

        <h3 className={`text-xl font-bold text-green-700 mt-6 mb-4 text-center`}>Observações Técnicas</h3>
        <div>
          <p className={`font-semibold text-gray-700 mb-1 text-lg`}>Estágio Fenológico Observado:</p>
          <p className={`text-gray-900 text-xl`}>{report.estagioFenologico}</p>
        </div>

        <div>
          <p className={`font-semibold text-gray-700 mb-1 text-lg`}>Observações Gerais da Lavoura:</p>
          <p className={`text-gray-900 text-xl`}>{report.observacoesGerais}</p>
        </div>

        <div>
          <p className={`font-semibold text-gray-700 mb-1 text-lg`}>Problemas Identificados:</p>
          <p className={`text-gray-900 text-xl`}>{report.problemasIdentificados}</p>
        </div>

        <div>
          <p className={`font-semibold text-gray-700 mb-1 text-lg`}>Orientações Técnicas Fornecidas:</p>
          <p className={`text-gray-900 text-xl`}>{report.orientacoesTecnicas}</p>
        </div>

        <div>
          <p className={`font-semibold text-gray-700 mb-1 text-lg`}>Padrão de Qualidade e Potencial Produtivo Estimado:</p>
          <p className={`text-gray-900 text-xl`}>{report.potencialProdutivo}</p>
        </div>

        {report.fotos && report.fotos.length > 0 && (
          <div className="border border-gray-200 p-4 rounded-xl bg-white shadow-sm mt-6">
            <h4 className={`text-lg font-semibold text-gray-700 mb-3 flex items-center`}>
              <Camera className="w-5 h-5 mr-2" />
              Fotos
            </h4>
            <div className={`
              grid gap-4
              grid-cols-2 sm:grid-cols-3 md:grid-cols-4
            `}>
              {report.fotos.map((photoUrl, index) => (
                <div key={index} className={`
                  relative group rounded-lg overflow-hidden shadow-sm
                  aspect-w-16 aspect-h-9
                `}>
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
        {/* Botão de Compartilhar removido */}
      </div>
      {/* Exibição da mensagem de compartilhamento removida */}
      </div>
    );
  };
  
  // Prop Types for ReportView
  ReportView.propTypes = {
    report: PropTypes.object.isRequired,
    onCancel: PropTypes.func.isRequired,
    onGeneratePdf: PropTypes.func.isRequired,
    // onShareReport removido
    // eslint-disable-next-line no-unused-vars
    openPhotoModal: PropTypes.func.isRequired, // Adicionado comentário para ignorar o aviso do ESLint
    isPdfMode: PropTypes.bool.isRequired,
    loadingPdf: PropTypes.bool.isRequired,
    setLoadingPdf: PropTypes.func.isRequired,
    setIsPdfMode: PropTypes.func.isRequired,
    setError: PropTypes.func.isRequired,
    // shareMessage removido
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
            className="max-w-full h-auto object-contain rounded-lg shadow-xl"
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
