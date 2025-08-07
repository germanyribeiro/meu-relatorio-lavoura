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
import { getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, query, serverTimestamp, enableIndexedDbPersistence } from 'firebase/firestore'; 

// Importar ícones do Lucide React
import { PlusCircle, Edit, Trash2, List, FileText, XCircle, Camera, Save, Loader2, Eye, EyeOff, LogIn, UserPlus, LogOut, Search, LayoutGrid, Table, Printer } from 'lucide-react'; 

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
  const [indexedDbError, setIndexedDbError] = useState(null); // NOVO ESTADO PARA ERROS DO INDEXEDDB
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState('');
  const [isPdfMode, setIsPdfMode] = useState(false); 
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Estados para autenticação
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isLoginView, setIsLoginView] = useState(true);
  const [showPassword, setShowPassword] = useState(false); // NOVO ESTADO: Para alternar a visibilidade da senha

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

        // Tente habilitar a persistência offline do Firestore
        try {
          await enableIndexedDbPersistence(firestore);
          console.log("DEBUG: Persistência offline do Firestore habilitada.");
          setIndexedDbError(null); // Limpa quaisquer erros anteriores do IndexedDB
        } catch (err) {
          let errorMessage = "";
          if (err.code === 'failed-precondition') {
            // Múltiplas abas abertas, persistência não pode ser habilitada
            console.warn("DEBUG: Persistência offline não pode ser habilitada. Provavelmente múltiplas abas abertas ou dados corrompidos.");
            errorMessage = "Não foi possível ativar o modo offline: Múltiplas abas abertas ou dados corrompidos. Tente recarregar a página.";
          } else if (err.code === 'unimplemented') {
            // O navegador não suporta IndexedDB (raro hoje em dia)
            console.error("DEBUG: O navegador não suporta persistência offline.");
            errorMessage = "Seu navegador não suporta o modo offline. Por favor, atualize-o ou use outro navegador.";
          } else {
            // Catch-all para outros erros, incluindo corrupção de IndexedDB
            console.error("DEBUG: Erro ao habilitar persistência offline:", err);
            if (err.message.includes("refusing to open IndexedDB database due to potential corruption")) {
              errorMessage = "Erro no modo offline: O banco de dados local pode estar corrompido. Por favor, recarregue a página (Ctrl+R ou F5) para tentar re-inicializar o modo offline.";
            } else {
              errorMessage = `Erro inesperado ao ativar o modo offline: ${err.message}.`;
            }
          }
          setIndexedDbError(errorMessage); // Define o erro específico do IndexedDB, mas não bloqueia o aplicativo
        }

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
        setError(`Erro na inicialização do Firebase: ${err.message}`); // Isso é para erros críticos de inicialização do Firebase
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
      setErrorFunc("Erro: A biblioteca jsPDF não foi carregada. Verifique o console do navegador.");
      setLoadingPdfFunc(false);
      return;
    }

    setLoadingPdfFunc(true);
    setIsPdfModeFunc(true);

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
      pdf.setFontSize(16);
      pdf.text("Relatório de Acompanhamento de Lavoura", 105, yPos, { align: 'center' });
      yPos += 10;
      addPageIfNeeded();

      // Funções auxiliares para adicionar texto com quebra de linha e rótulos
      const addSectionTitle = (title) => {
        pdf.setFontSize(11);
        pdf.text(title, margin, yPos);
        yPos += lineHeight * 1.5;
        addPageIfNeeded();
        pdf.setFontSize(9); // Reset para texto do corpo
      };

      const addField = (label, value) => {
        if (value) {
          const text = `${label} ${value}`;
          const splitText = pdf.splitTextToSize(text, maxLineWidth);
          pdf.text(splitText, margin, yPos);
          yPos += splitText.length * lineHeight;
          addPageIfNeeded();
        }
      };

      // 1. Dados da Visita e do Técnico
      addSectionTitle("1. Dados da Visita e do Técnico");
      addField("Data da Visita:", new Date(reportData.dataVisita).toLocaleDateString('pt-BR'));
      addField("Hora da Visita:", reportData.horaVisita);
      addField("Nome do Técnico/Responsável:", reportData.nomeTecnico);
      yPos += lineHeight;
      addPageIfNeeded();

      // 2. Dados da Propriedade
      addSectionTitle("2. Dados da Propriedade");
      addField("Nome da Propriedade:", reportData.nomePropriedade);
      addField("Contratante:", reportData.contratante);
      addField("Localização:", reportData.localizacao);
      addField("Cultura(s) Acompanhada(s):", reportData.cultura);
      addField("Área Total da(s) Lavouras Visitada(s) (ha/alqueires):", reportData.areaTotal);
      yPos += lineHeight;
      addPageIfNeeded();

      // 3. Observações Gerais da Lavoura
      addSectionTitle("3. Observações Gerais da Lavoura");
      addField("Estágio Fenológico Atual:", reportData.estagioFenologico);
      addField("Condições Climáticas no Período:", reportData.condicoesClimaticas);
      addField("Observações Visuais:", reportData.observacoesVisuais);
      yPos += lineHeight;
      addPageIfNeeded();

      // 4. Avaliação da Qualidade da Lavoura
      addSectionTitle("4. Avaliação da Qualidade da Lavoura");
      addField("Pragas Identificadas (Nome, Nível de Infestação):", reportData.pragasIdentificadas);
      addField("Doenças Identificadas (Nome, Nível de Incidência):", reportData.doencasIdentificadas);
      addField("Déficits Nutricionais (Sintomas, Deficiência Suspeita):", reportData.deficitNutricionais);
      addField("Controle de Plantas Daninhas (Eficiência, Espécies Predominantes):", reportData.controleDandinha);
      addField("Aspectos Físicos do Solo:", reportData.aspectosSolo);
      addField("Outras Observações de Qualidade:", reportData.outrasQualidade);
      yPos += lineHeight;
      addPageIfNeeded();

      // 5. Potencial Produtivo da Lavoura
      addSectionTitle("5. Potencial Produtivo da Lavoura");
      addField("Estimativa de Produção (Atual/Revisada):", reportData.estimativaProducao);
      addField("Fatores Limitantes Observados:", reportData.fatoresLimitantes);
      addField("Fatores Favoráveis Observados:", reportData.fatoresFavoraveis);
      yPos += lineHeight;
      addPageIfNeeded();

      // 6. Orientações Técnicas Fornecidas ao Corpo Gerencial
      addSectionTitle("6. Orientações Técnicas Fornecidas ao Corpo Gerencial");
      addField("Recomendações para Próximos Dias/Semana:", reportData.recomendacoesProximosDias);
      addField("Manejo Fitossanitário (Produto, Dose, Momento):", reportData.manejoFitossanitario);
      addField("Manejo Nutricional (Fertilizante, Dose, Momento):", reportData.manejoNutricional);
      addField("Manejo Cultural (Rotação, Preparo de Solo, etc.):", reportData.manejoCultural);
      addField("Outras Recomendações:", reportData.outrasRecomendacoes);
      yPos += lineHeight;
      addPageIfNeeded();

      // 7. Próximos Passos e Ações de Acompanhamento
      addSectionTitle("7. Próximos Passos e Ações de Acompanhamento");
      addField("Data Sugerida para Próxima Visita:", reportData.dataProximaVisita);
      addField("Ações a Serem Verificadas na Próxima Visita:", reportData.acoesVerificar);
      yPos += lineHeight;
      addPageIfNeeded();

      // 8. Observações Adicionais/Comentários
      addSectionTitle("8. Observações Adicionais/Comentários");
      addField("", reportData.observacoesAdicionais); // Não tem rótulo específico para este campo
      yPos += lineHeight;
      addPageIfNeeded();

      // Seção: Fotos
      if (reportData.fotos && reportData.fotos.length > 0) {
        pdf.setFontSize(10);
        pdf.text("Fotos", margin, yPos);
        yPos += lineHeight * 1.5;
        addPageIfNeeded();

        const imgWidth = 20;
        const imgHeight = 20;
        const imgMargin = 5;
        let currentX = margin;

        for (const photoUrl of reportData.fotos) {
          addPageIfNeeded();
          if (currentX + imgWidth > 210 - margin) {
            currentX = margin;
            yPos += imgHeight + imgMargin;
            addPageIfNeeded();
          }

          try {
            pdf.addImage(photoUrl, 'PNG', currentX, yPos, imgWidth, imgHeight);
          } catch (imgError) {
            console.error("Erro ao adicionar imagem ao PDF:", imgError);
            pdf.setFontSize(8);
            pdf.text("Erro na imagem", currentX, yPos + imgHeight / 2, { align: 'center' });
            pdf.setFontSize(9);
          }
          currentX += imgWidth + imgMargin;
        }
        yPos += imgHeight + lineHeight;
        addPageIfNeeded();
      }

      const filename = `Relatorio_Lavoura_${reportData.nomePropriedade.replace(/\s/g, '_')}_${reportData.dataVisita}.pdf`;
      pdf.save(filename);
      console.log("DEBUG: PDF salvo com sucesso (ou tentativa de download iniciada).");

    } catch (error) {
      console.error("ERRO DETALHADO DURANTE A GERAÇÃO DO PDF:", error);
      setErrorFunc(`Erro ao gerar PDF: ${error.message}. Verifique o console do navegador.`);
    } finally {
      setLoadingPdfFunc(false);
      setIsPdfModeFunc(false);
      console.log("DEBUG: Geração de PDF finalizada (limpeza de estados).");
    }
  }, []);

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
              <div className="relative"> {/* Adicionado div com relative para posicionar o ícone */}
                <label htmlFor="password" className="sr-only">Senha</label>
                <input
                  type={showPassword ? "text" : "password"} // Alterna o tipo do input
                  id="password"
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg pr-10" // Adicionado padding à direita
                />
                <button
                  type="button" // Importante: type="button" para não submeter o formulário
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
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

      {/* Mensagem de erro do IndexedDB, se houver */}
      {indexedDbError && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700 p-4 mb-6 rounded-lg shadow-sm" role="alert">
          <p className="font-bold">Aviso de Modo Offline:</p>
          <p className="text-sm">{indexedDbError}</p>
        </div>
      )}

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
            isPdfMode={isPdfMode}
            loadingPdf={loadingPdf}
            setLoadingPdf={setLoadingPdf}
            setIsPdfMode={setIsPdfMode} 
            setError={setError} 
          />
        )}
        {view === 'view' && currentReport && (
          <ReportView
            report={currentReport}
            onCancel={() => { setView('list'); setCurrentReport(null); }}
            onGeneratePdf={generatePdfFromReportData}
            isPdfMode={isPdfMode}
            loadingPdf={loadingPdf}
            setLoadingPdf={setLoadingPdf}
            setIsPdfMode={setIsPdfMode} 
            setError={setError} 
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
      report.nomePropriedade.toLowerCase().includes(lowerCaseSearchTerm) ||
      report.cultura.toLowerCase().includes(lowerCaseSearchTerm) ||
      reportDate.includes(lowerCaseSearchTerm) ||
      (report.nomeTecnico && report.nomeTecnico.toLowerCase().includes(lowerCaseSearchTerm))
    );
  });

  return (
    <div>
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center">
        <List className="w-6 h-6 mr-2" />
        Meus Relatórios
      </h2>

      {/* Campo de filtro e botões de visualização */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 space-y-4 sm:space-y-0 sm:space-x-4 report-list-controls">
        <div className="relative w-full sm:w-auto flex-grow">
          <input
            type="text"
            placeholder="Filtrar por propriedade, cultura, data ou responsável"
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
                  <h3 className="text-xl font-semibold text-green-700 mb-2 truncate">{report.nomePropriedade}</h3>
                  <p className="text-lg font-medium text-gray-800 mb-3">{report.cultura}</p>
                  <p className="text-sm text-gray-600 mb-1">Data: {new Date(report.dataVisita).toLocaleDateString('pt-BR')}</p>
                  <p className="text-sm text-gray-600">Responsável: {report.nomeTecnico || 'N/A'}</p>
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
                    Cultura
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
                      {report.nomePropriedade}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {report.cultura}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {new Date(report.dataVisita).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {report.nomeTecnico || 'N/A'}
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

const ReportForm = ({ report, onSave, onCancel, isEditing, onGeneratePdf, openPhotoModal, isPdfMode, loadingPdf, setLoadingPdf, setIsPdfMode, setError }) => {
  const [formData, setFormData] = useState({
    // 1. Dados da Visita e do Técnico
    dataVisita: new Date().toISOString().split('T')[0],
    horaVisita: new Date().toTimeString().split(' ')[0].substring(0, 5), // Default to current time
    nomeTecnico: '',

    // 2. Dados da Propriedade
    nomePropriedade: '',
    contratante: '',
    localizacao: '',
    cultura: '',
    areaTotal: '',

    // 3. Observações Gerais da Lavoura
    estagioFenologico: '',
    condicoesClimaticas: '',
    observacoesVisuais: '',

    // 4. Avaliação da Qualidade da Lavoura
    pragasIdentificadas: '',
    doencasIdentificadas: '',
    deficitNutricionais: '',
    controleDandinha: '',
    aspectosSolo: '',
    outrasQualidade: '',

    // 5. Potencial Produtivo da Lavoura
    estimativaProducao: '',
    fatoresLimitantes: '',
    fatoresFavoraveis: '',

    // 6. Orientações Técnicas Fornecidas ao Corpo Gerencial
    recomendacoesProximosDias: '',
    manejoFitossanitario: '',
    manejoNutricional: '',
    manejoCultural: '',
    outrasRecomendacoes: '',

    // 7. Próximos Passos e Ações de Acompanhamento
    dataProximaVisita: '',
    acoesVerificar: '',

    // 8. Observações Adicionais/Comentários
    observacoesAdicionais: '',

    fotos: [],
    ...report, // Preenche se estiver editando
  });

  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          fotos: [...prev.fotos, reader.result]
        }));
      };
      reader.readAsDataURL(file);
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
    setLoadingPdf(true);
    await onGeneratePdf(formData, null, setLoadingPdf, setIsPdfMode, setError);
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center print-hidden">
        {isEditing ? <Edit className="w-6 h-6 mr-2" /> : <FileText className="w-6 h-6 mr-2" />}
        {isEditing ? 'Editar Relatório' : 'Novo Relatório'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={`
          p-4 sm:p-6
          md:p-12 lg:px-28 lg:py-20
          border border-gray-200 rounded-xl bg-gray-50 space-y-4
          printable-report
        `}>
          {/* Título Principal do Relatório */}
          <h2 className="text-xl font-bold mb-4 text-center">Relatório de Acompanhamento de Lavouras</h2>

          {/* Seção 1: Dados da Visita e do Técnico */}
          <h3 className="text-lg font-semibold mt-4 mb-2">1. Dados da Visita e do Técnico</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="dataVisita" className="block font-semibold text-gray-700 mb-1 text-lg">Data da Visita:</label>
              <input type="date" id="dataVisita" name="dataVisita" value={formData.dataVisita} onChange={handleChange} required className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
            </div>
            <div>
              <label htmlFor="horaVisita" className="block font-semibold text-gray-700 mb-1 text-lg">Hora da Visita:</label>
              <input type="time" id="horaVisita" name="horaVisita" value={formData.horaVisita} onChange={handleChange} required className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
            </div>
            <div>
              <label htmlFor="nomeTecnico" className="block font-semibold text-gray-700 mb-1 text-lg">Nome do Técnico/Responsável:</label>
              <input type="text" id="nomeTecnico" name="nomeTecnico" value={formData.nomeTecnico} onChange={handleChange} required placeholder="Ex: João Silva" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
            </div>
          </div>

          {/* Seção 2: Dados da Propriedade */}
          <h3 className="text-lg font-semibold mt-4 mb-2">2. Dados da Propriedade</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="nomePropriedade" className="block font-semibold text-gray-700 mb-1 text-lg">Nome da Propriedade:</label>
              <input type="text" id="nomePropriedade" name="nomePropriedade" value={formData.nomePropriedade} onChange={handleChange} required placeholder="Ex: Fazenda Boa Esperança" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
            </div>
            <div>
              <label htmlFor="contratante" className="block font-semibold text-gray-700 mb-1 text-lg">Contratante:</label>
              <input type="text" id="contratante" name="contratante" value={formData.contratante} onChange={handleChange} required placeholder="Ex: Agropecuária XYZ" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
            </div>
            <div>
              <label htmlFor="localizacao" className="block font-semibold text-gray-700 mb-1 text-lg">Localização:</label>
              <input type="text" id="localizacao" name="localizacao" value={formData.localizacao} onChange={handleChange} required placeholder="Ex: Londrina/PR" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
            </div>
            <div>
              <label htmlFor="cultura" className="block font-semibold text-gray-700 mb-1 text-lg">Cultura(s) Acompanhada(s):</label>
              <input type="text" id="cultura" name="cultura" value={formData.cultura} onChange={handleChange} required placeholder="Ex: Soja, Milho" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="areaTotal" className="block font-semibold text-gray-700 mb-1 text-lg">Área Total da(s) Lavouras Visitada(s) (ha/alqueires):</label>
              <input type="text" id="areaTotal" name="areaTotal" value={formData.areaTotal} onChange={handleChange} required placeholder="Ex: 150 ha" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
            </div>
          </div>

          {/* Seção 3: Observações Gerais da Lavoura */}
          <h3 className="text-lg font-semibold mt-4 mb-2">3. Observações Gerais da Lavoura</h3>
          <div>
            <label htmlFor="estagioFenologico" className="block font-semibold text-gray-700 mb-1 text-lg">Estágio Fenológico Atual:</label>
            <input type="text" id="estagioFenologico" name="estagioFenologico" value={formData.estagioFenologico} onChange={handleChange} placeholder="Ex: V3, R1, Florescimento" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
          </div>
          <div>
            <label htmlFor="condicoesClimaticas" className="block font-semibold text-gray-700 mb-1 text-lg">Condições Climáticas no Período:</label>
            <textarea id="condicoesClimaticas" name="condicoesClimaticas" rows="3" value={formData.condicoesClimaticas} onChange={handleChange} placeholder="Ex: Chuvas regulares, seca, altas temperaturas" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="observacoesVisuais" className="block font-semibold text-gray-700 mb-1 text-lg">Observações Visuais:</label>
            <textarea id="observacoesVisuais" name="observacoesVisuais" rows="3" value={formData.observacoesVisuais} onChange={handleChange} placeholder="Ex: Vigor da planta, coloração, uniformidade" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>

          {/* Seção 4: Avaliação da Qualidade da Lavoura */}
          <h3 className="text-lg font-semibold mt-4 mb-2">4. Avaliação da Qualidade da Lavoura</h3>
          <div>
            <label htmlFor="pragasIdentificadas" className="block font-semibold text-gray-700 mb-1 text-lg">Pragas Identificadas (Nome, Nível de Infestação):</label>
            <textarea id="pragasIdentificadas" name="pragasIdentificadas" rows="3" value={formData.pragasIdentificadas} onChange={handleChange} placeholder="Ex: Lagarta da soja (média), Percevejo (baixa)" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="doencasIdentificadas" className="block font-semibold text-gray-700 mb-1 text-lg">Doenças Identificadas (Nome, Nível de Incidência):</label>
            <textarea id="doencasIdentificadas" name="doencasIdentificadas" rows="3" value={formData.doencasIdentificadas} onChange={handleChange} placeholder="Ex: Ferrugem asiática (incipiente), Mancha alvo (baixa)" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="deficitNutricionais" className="block font-semibold text-gray-700 mb-1 text-lg">Déficits Nutricionais (Sintomas, Deficiência Suspeita):</label>
            <textarea id="deficitNutricionais" name="deficitNutricionais" rows="3" value={formData.deficitNutricionais} onChange={handleChange} placeholder="Ex: Amarelamento das folhas mais velhas (deficiência de N)" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="controleDandinha" className="block font-semibold text-gray-700 mb-1 text-lg">Controle de Plantas Daninhas (Eficiência, Espécies Predominantes):</label>
            <textarea id="controleDandinha" name="controleDandinha" rows="3" value={formData.controleDandinha} onChange={handleChange} placeholder="Ex: Bom controle, mas com escapes de buva" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="aspectosSolo" className="block font-semibold text-gray-700 mb-1 text-lg">Aspectos Físicos do Solo:</label>
            <textarea id="aspectosSolo" name="aspectosSolo" rows="3" value={formData.aspectosSolo} onChange={handleChange} placeholder="Ex: Boa estrutura, sem compactação aparente" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="outrasQualidade" className="block font-semibold text-gray-700 mb-1 text-lg">Outras Observações de Qualidade:</label>
            <textarea id="outrasQualidade" name="outrasQualidade" rows="3" value={formData.outrasQualidade} onChange={handleChange} placeholder="Ex: Qualidade da aplicação de insumos, manejo da irrigação" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>

          {/* Seção 5: Potencial Produtivo da Lavoura */}
          <h3 className="text-lg font-semibold mt-4 mb-2">5. Potencial Produtivo da Lavoura</h3>
          <div>
            <label htmlFor="estimativaProducao" className="block font-semibold text-gray-700 mb-1 text-lg">Estimativa de Produção (Atual/Revisada):</label>
            <input type="text" id="estimativaProducao" name="estimativaProducao" value={formData.estimativaProducao} onChange={handleChange} placeholder="Ex: 65 sacas/hectare" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
          </div>
          <div>
            <label htmlFor="fatoresLimitantes" className="block font-semibold text-gray-700 mb-1 text-lg">Fatores Limitantes Observados:</label>
            <textarea id="fatoresLimitantes" name="fatoresLimitantes" rows="3" value={formData.fatoresLimitantes} onChange={handleChange} placeholder="Ex: Estresse hídrico, alta pressão de pragas" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="fatoresFavoraveis" className="block font-semibold text-gray-700 mb-1 text-lg">Fatores Favoráveis Observados:</label>
            <textarea id="fatoresFavoraveis" name="fatoresFavoraveis" rows="3" value={formData.fatoresFavoraveis} onChange={handleChange} placeholder="Ex: Bom desenvolvimento vegetativo, bom pegamento de flor/fruto" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>

          {/* Seção 6: Orientações Técnicas Fornecidas ao Corpo Gerencial */}
          <h3 className="text-lg font-semibold mt-4 mb-2">6. Orientações Técnicas Fornecidas ao Corpo Gerencial</h3>
          <div>
            <label htmlFor="recomendacoesProximosDias" className="block font-semibold text-gray-700 mb-1 text-lg">Recomendações para Próximos Dias/Semana:</label>
            <textarea id="recomendacoesProximosDias" name="recomendacoesProximosDias" rows="3" value={formData.recomendacoesProximosDias} onChange={handleChange} placeholder="Ex: Monitoramento diário de pragas, aplicação de fungicida" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="manejoFitossanitario" className="block font-semibold text-gray-700 mb-1 text-lg">Manejo Fitossanitário (Produto, Dose, Momento):</label>
            <textarea id="manejoFitossanitario" name="manejoFitossanitario" rows="3" value={formData.manejoFitossanitario} onChange={handleChange} placeholder="Ex: Glifosato (1.5 L/ha) para daninhas, Chlorpyrifos (0.8 L/ha) para lagartas" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="manejoNutricional" className="block font-semibold text-gray-700 mb-1 text-lg">Manejo Nutricional (Fertilizante, Dose, Momento):</label>
            <textarea id="manejoNutricional" name="manejoNutricional" rows="3" value={formData.manejoNutricional} onChange={handleChange} placeholder="Ex: Ureia (100 kg/ha) em cobertura" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="manejoCultural" className="block font-semibold text-gray-700 mb-1 text-lg">Manejo Cultural (Rotação, Preparo de Solo, etc.):</label>
            <textarea id="manejoCultural" name="manejoCultural" rows="3" value={formData.manejoCultural} onChange={handleChange} placeholder="Ex: Rotação com milho safrinha, preparo mínimo do solo" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>
          <div>
            <label htmlFor="outrasRecomendacoes" className="block font-semibold text-gray-700 mb-1 text-lg">Outras Recomendações:</label>
            <textarea id="outrasRecomendacoes" name="outrasRecomendacoes" rows="3" value={formData.outrasRecomendacoes} onChange={handleChange} placeholder="Ex: Calibração de máquinas, uso de EPIs" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>

          {/* Seção 7: Próximos Passos e Ações de Acompanhamento */}
          <h3 className="text-lg font-semibold mt-4 mb-2">7. Próximos Passos e Ações de Acompanhamento</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="dataProximaVisita" className="block font-semibold text-gray-700 mb-1 text-lg">Data Sugerida para Próxima Visita:</label>
              <input type="date" id="dataProximaVisita" name="dataProximaVisita" value={formData.dataProximaVisita} onChange={handleChange} className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg" />
            </div>
            <div>
              <label htmlFor="acoesVerificar" className="block font-semibold text-gray-700 mb-1 text-lg">Ações a Serem Verificadas na Próxima Visita:</label>
              <textarea id="acoesVerificar" name="acoesVerificar" rows="2" value={formData.acoesVerificar} onChange={handleChange} placeholder="Ex: Eficácia da aplicação de fungicida, desenvolvimento da cultura" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
            </div>
          </div>

          {/* Seção 8: Observações Adicionais/Comentários */}
          <h3 className="text-lg font-semibold mt-4 mb-2">8. Observações Adicionais/Comentários</h3>
          <div>
            <textarea id="observacoesAdicionais" name="observacoesAdicionais" rows="4" value={formData.observacoesAdicionais} onChange={handleChange} placeholder="Qualquer outra informação relevante." className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 text-lg"></textarea>
          </div>

          <div className="border border-gray-200 p-4 rounded-xl bg-white shadow-sm mt-6">
            <h3 className={`text-lg font-semibold text-gray-700 mb-3 flex items-center`}>
              <Camera className="w-5 h-5 mr-2" />
              Fotos do Relatório
            </h3>
            <div className="print-hidden">
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
            </div>
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
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
                    className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 print-hidden"
                    aria-label="Remover foto"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center md:justify-end gap-4 mt-8 print-hidden">
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-col sm:flex-row items-center justify-center sm:justify-start px-4 py-2 sm:px-6 sm:py-3 bg-gray-500 text-white rounded-lg shadow-md hover:bg-gray-600 transition duration-300 ease-in-out text-sm sm:text-base text-center"
          >
            <XCircle className="w-5 h-5 mb-1 sm:mb-0 sm:mr-2" />
            Cancelar
          </button>
          <button
            type="submit"
            className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition duration-300 ease-in-out transform hover:scale-105"
          >
            <Save className="w-5 h-5 mr-2" />
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
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 transition duration-300 ease-in-out transform hover:scale-105"
          >
            <Printer className="w-5 h-5 mr-2" />
            Imprimir Relatório
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
  setIsPdfMode: PropTypes.func.isRequired, 
  setError: PropTypes.func.isRequired, 
};

const ReportView = ({ report, onCancel, onGeneratePdf, openPhotoModal, isPdfMode, loadingPdf, setLoadingPdf, setIsPdfMode, setError }) => {
  const handleGeneratePdfClick = async () => {
    setLoadingPdf(true);
    await onGeneratePdf(report, null, setLoadingPdf, setIsPdfMode, setError);
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center print-hidden">
        <Eye className="w-6 h-6 mr-2" />
        Detalhes do Relatório
      </h2>
      <div className={`
          p-4 sm:p-6
          md:p-12 lg:px-28 lg:py-20
          border border-gray-200 rounded-xl bg-gray-50 mb-6 space-y-4
          printable-report
        `}>
        {/* Título Principal do Relatório */}
        <h2 className="text-xl font-bold mb-4 text-center">Relatório de Acompanhamento de Lavouras</h2>

        {/* Seção 1: Dados da Visita e do Técnico */}
        <h3 className="text-lg font-semibold mt-4 mb-2">1. Dados da Visita e do Técnico</h3>
        <p><strong>Data da Visita:</strong> {new Date(report.dataVisita).toLocaleDateString('pt-BR')}</p>
        <p><strong>Hora da Visita:</strong> {report.horaVisita}</p>
        <p><strong>Nome do Técnico/Responsável:</strong> {report.nomeTecnico}</p>

        {/* Seção 2: Dados da Propriedade */}
        <h3 className="text-lg font-semibold mt-4 mb-2">2. Dados da Propriedade</h3>
        <p><strong>Nome da Propriedade:</strong> {report.nomePropriedade}</p>
        <p><strong>Contratante:</strong> {report.contratante}</p>
        <p><strong>Localização:</strong> {report.localizacao}</p>
        <p><strong>Cultura(s) Acompanhada(s):</strong> {report.cultura}</p>
        <p><strong>Área Total da(s) Lavouras Visitada(s) (ha/alqueires):</strong> {report.areaTotal}</p>

        {/* Seção 3: Observações Gerais da Lavoura */}
        <h3 className="text-lg font-semibold mt-4 mb-2">3. Observações Gerais da Lavoura</h3>
        <p><strong>Estágio Fenológico Atual:</strong> {report.estagioFenologico || 'N/A'}</p>
        <p><strong>Condições Climáticas no Período:</strong> {report.condicoesClimaticas || 'N/A'}</p>
        <p><strong>Observações Visuais:</strong> {report.observacoesVisuais || 'N/A'}</p>

        {/* Seção 4: Avaliação da Qualidade da Lavoura */}
        <h3 className="text-lg font-semibold mt-4 mb-2">4. Avaliação da Qualidade da Lavoura</h3>
        <p><strong>Pragas Identificadas (Nome, Nível de Infestação):</strong> {report.pragasIdentificadas || 'N/A'}</p>
        <p><strong>Doenças Identificadas (Nome, Nível de Incidência):</strong> {report.doencasIdentificadas || 'N/A'}</p>
        <p><strong>Déficits Nutricionais (Sintomas, Deficiência Suspeita):</strong> {report.deficitNutricionais || 'N/A'}</p>
        <p><strong>Controle de Plantas Daninhas (Eficiência, Espécies Predominantes):</strong> {report.controleDandinha || 'N/A'}</p>
        <p><strong>Aspectos Físicos do Solo:</strong> {report.aspectosSolo || 'N/A'}</p>
        <p><strong>Outras Observações de Qualidade:</strong> {report.outrasQualidade || 'N/A'}</p>

        {/* Seção 5: Potencial Produtivo da Lavoura */}
        <h3 className="text-lg font-semibold mt-4 mb-2">5. Potencial Produtivo da Lavoura</h3>
        <p><strong>Estimativa de Produção (Atual/Revisada):</strong> {report.estimativaProducao || 'N/A'}</p>
        <p><strong>Fatores Limitantes Observados:</strong> {report.fatoresLimitantes || 'N/A'}</p>
        <p><strong>Fatores Favoráveis Observados:</strong> {report.fatoresFavoraveis || 'N/A'}</p>

        {/* Seção 6: Orientações Técnicas Fornecidas ao Corpo Gerencial */}
        <h3 className="text-lg font-semibold mt-4 mb-2">6. Orientações Técnicas Fornecidas ao Corpo Gerencial</h3>
        <p><strong>Recomendações para Próximos Dias/Semana:</strong> {report.recomendacoesProximosDias || 'N/A'}</p>
        <p><strong>Manejo Fitossanitário (Produto, Dose, Momento):</strong> {report.manejoFitossanitario || 'N/A'}</p>
        <p><strong>Manejo Nutricional (Fertilizante, Dose, Momento):</strong> {report.manejoNutricional || 'N/A'}</p>
        <p><strong>Manejo Cultural (Rotação, Preparo de Solo, etc.):</strong> {report.manejoCultural || 'N/A'}</p>
        <p><strong>Outras Recomendações:</strong> {report.outrasRecomendacoes || 'N/A'}</p>

        {/* Seção 7: Próximos Passos e Ações de Acompanhamento */}
        <h3 className="text-lg font-semibold mt-4 mb-2">7. Próximos Passos e Ações de Acompanhamento</h3>
        <p><strong>Data Sugerida para Próxima Visita:</strong> {report.dataProximaVisita || 'N/A'}</p>
        <p><strong>Ações a Serem Verificadas na Próxima Visita:</strong> {report.acoesVerificar || 'N/A'}</p>

        {/* Seção 8: Observações Adicionais/Comentários */}
        <h3 className="text-lg font-semibold mt-4 mb-2">8. Observações Adicionais/Comentários</h3>
        <p>{report.observacoesAdicionais || 'N/A'}</p>

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

      <div className="flex flex-wrap justify-center md:justify-end gap-4 print-hidden">
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
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 transition duration-300 ease-in-out transform hover:scale-105"
        >
          <Printer className="w-5 h-5 mr-2" />
          Imprimir Relatório
        </button>
      </div>
    </div>
  );
};
  
// Prop Types for ReportView
ReportView.propTypes = {
  report: PropTypes.object.isRequired,
  onCancel: PropTypes.func.isRequired,
  onGeneratePdf: PropTypes.func.isRequired,
  openPhotoModal: PropTypes.func.isRequired,
  isPdfMode: PropTypes.bool.isRequired,
  loadingPdf: PropTypes.bool.isRequired,
  setLoadingPdf: PropTypes.func.isRequired,
  setIsPdfMode: PropTypes.func.isRequired,
  setError: PropTypes.func.isRequired,
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
