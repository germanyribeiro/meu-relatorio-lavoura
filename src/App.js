import React, { useState, useEffect, useContext, createContext } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  addDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  Timestamp 
} from 'firebase/firestore';

import {
  User,
  Plus,
  Files,
  LogOut,
  Search,
  Filter,
  Eye,
  Trash2,
  Edit,
  Download,
  Printer,
  XCircle,
  Upload,
  ArrowLeft
} from 'lucide-react';

// Variáveis globais para configuração do Firebase, fornecidas pelo ambiente.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : '';

// Contexto para o estado de autenticação do usuário.
const AuthContext = createContext();

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('welcome');
  const [selectedReport, setSelectedReport] = useState(null);
  const [error, setError] = useState('');

  // Efeito para inicializar o Firebase e o estado de autenticação.
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const firestore = getFirestore(app);
        setAuth(auth);
        setDb(firestore);

        // Define um listener para o estado de autenticação do usuário.
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
          if (currentUser) {
            setUser(currentUser);
            setScreen('dashboard');
          } else {
            setUser(null);
            setScreen('welcome');
          }
          setLoading(false);
        });

        // Tenta fazer o login com o token de autenticação personalizado.
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          // Se não houver token, faz o login anônimo.
          await signInAnonymously(auth);
        }

        return () => unsubscribe();
      } catch (e) {
        console.error("Erro ao inicializar o Firebase:", e);
        setError("Erro ao inicializar a aplicação. Por favor, tente novamente.");
        setLoading(false);
      }
    };

    initializeFirebase();
  }, []);

  return (
    <AuthContext.Provider value={{ user, db, auth, loading, screen, setScreen, selectedReport, setSelectedReport, error }}>
      {/* Script para jsPDF e html2canvas para gerar PDF */}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
      <div className="min-h-screen bg-gray-100 font-sans antialiased text-gray-800 flex items-center justify-center p-4">
        <div className="bg-white shadow-xl rounded-2xl w-full max-w-4xl p-6 md:p-10 transform transition-all duration-300 scale-95 md:scale-100">
          <MainContent />
        </div>
      </div>
    </AuthContext.Provider>
  );
};

const MainContent = () => {
  const { screen, loading, error } = useContext(AuthContext);

  if (loading) {
    return <div className="text-center p-20 text-gray-500 text-lg">Carregando...</div>;
  }

  if (error) {
    return <div className="text-center p-20 text-red-500 font-bold">{error}</div>;
  }

  switch (screen) {
    case 'welcome':
      return <WelcomeScreen />;
    case 'login':
      return <LoginScreen />;
    case 'dashboard':
      return <DashboardScreen />;
    case 'myReports':
      return <MyReportsScreen />;
    case 'newReport':
      return <ReportFormScreen />;
    case 'editReport':
      return <ReportFormScreen isEditing />;
    case 'viewReport':
      return <ReportViewScreen />;
    default:
      return <WelcomeScreen />;
  }
};

const WelcomeScreen = () => {
  const { setScreen } = useContext(AuthContext);
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <img
        src="https://placehold.co/150x150/65a30d/ffffff?text=AgriApp"
        alt="AgriApp Logo"
        className="mb-6 rounded-full shadow-lg"
      />
      <h1 className="text-4xl font-bold text-green-700 mb-4">Bem-vindo ao AgriApp</h1>
      <p className="text-gray-600 mb-8 max-w-sm">
        Sua ferramenta para gerenciar e acompanhar relatórios de lavouras.
      </p>
      <button
        onClick={() => setScreen('login')}
        className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105"
      >
        Entrar
      </button>
    </div>
  );
};

const LoginScreen = () => {
  const { auth, setScreen } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password') {
        setLoginError('E-mail ou senha incorretos.');
      } else {
        try {
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (createError) {
          console.error("Erro ao criar conta:", createError);
          setLoginError('Erro ao fazer login ou criar conta. Verifique seu e-mail e senha.');
        }
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh]">
      <h2 className="text-3xl font-bold text-green-700 mb-6">Login</h2>
      <form onSubmit={handleLogin} className="w-full max-w-sm">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
            E-mail
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-200"
            required
          />
        </div>
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
            Senha
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-200"
            required
          />
        </div>
        {loginError && <p className="text-red-500 text-xs italic mb-4">{loginError}</p>}
        <div className="flex items-center justify-between flex-wrap">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105"
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setScreen('welcome')}
            className="text-gray-500 hover:text-gray-700 text-sm mt-4 md:mt-0 ml-auto"
          >
            Voltar
          </button>
        </div>
      </form>
    </div>
  );
};

const DashboardScreen = () => {
  const { user, auth, setScreen } = useContext(AuthContext);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Erro ao sair:", e);
    }
  };

  const displayName = user?.email || "Usuário";

  return (
    <div className="text-center p-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-green-700">
          Olá, <span className="text-green-600">{displayName}</span>!
        </h1>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-full transition-all duration-300"
        >
          <LogOut size={20} />
          <span className="hidden md:inline">Sair</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={() => setScreen('newReport')}
          className="bg-white hover:bg-green-500 hover:text-white text-green-600 font-bold p-8 rounded-2xl shadow-lg transform transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center gap-4 border-2 border-green-200"
        >
          <Plus size={40} />
          <span className="text-xl">Novo Relatório</span>
        </button>

        <button
          onClick={() => setScreen('myReports')}
          className="bg-white hover:bg-green-500 hover:text-white text-green-600 font-bold p-8 rounded-2xl shadow-lg transform transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center gap-4 border-2 border-green-200"
        >
          <Files size={40} />
          <span className="text-xl">Ver Relatórios</span>
        </button>
      </div>
       <p className="mt-8 text-gray-500 text-sm break-all">ID do Usuário: {user?.uid || 'Não autenticado'}</p>
    </div>
  );
};

const MyReportsScreen = () => {
  const { user, db, setScreen, setSelectedReport } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [properties, setProperties] = useState([]);
  const [cultures, setCultures] = useState([]);
  const [filterPropriedade, setFilterPropriedade] = useState('');
  const [filterCultura, setFilterCultura] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState(null);

  useEffect(() => {
    if (!user?.uid || !db) return;

    // Listen to the public reports collection
    const reportsCollection = collection(db, `artifacts/${appId}/public/data/reports`);
    const q = query(reportsCollection);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reportsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        data: doc.data().dadosVisita?.dataVisita?.toDate ? doc.data().dadosVisita.dataVisita.toDate() : new Date(),
      }));

      setReports(reportsList);
      setFilteredReports(reportsList);

      const uniqueProperties = [...new Set(reportsList.map(r => r.dadosPropriedade?.nomePropriedade).filter(Boolean))];
      const uniqueCultures = [...new Set(reportsList.map(r => r.dadosPropriedade?.culturaAcompanhada).filter(Boolean))];
      setProperties(uniqueProperties);
      setCultures(uniqueCultures);
    }, (error) => {
      console.error("Erro ao buscar relatórios:", error);
    });

    return () => unsubscribe();
  }, [user, db]);

  useEffect(() => {
    let tempReports = reports;

    if (filterPropriedade) {
      tempReports = tempReports.filter(r => r.dadosPropriedade?.nomePropriedade === filterPropriedade);
    }

    if (filterCultura) {
      tempReports = tempReports.filter(r => r.dadosPropriedade?.culturaAcompanhada === filterCultura);
    }

    setFilteredReports(tempReports);
  }, [filterPropriedade, filterCultura, reports]);

  const handleView = (report) => {
    setSelectedReport(report);
    setScreen('viewReport');
  };

  const handleEdit = (report) => {
    setSelectedReport(report);
    setScreen('editReport');
  };

  const handleDelete = async () => {
    if (!reportToDelete) return;
    try {
      const docRef = doc(db, `artifacts/${appId}/public/data/reports`, reportToDelete.id);
      await deleteDoc(docRef);
      console.log("Relatório excluído com sucesso!");
    } catch (e) {
      console.error("Erro ao excluir relatório:", e);
    }
    setIsModalOpen(false);
    setReportToDelete(null);
  };

  const openDeleteModal = (report) => {
    setReportToDelete(report);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setReportToDelete(null);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-green-700">Relatórios de Todos os Usuários</h2>
        <button
          onClick={() => setScreen('dashboard')}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-full transition-all duration-300"
        >
          <ArrowLeft size={20} />
          <span className="hidden md:inline ml-1">Voltar</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 p-4 bg-gray-100 rounded-xl shadow-inner">
        <div className="flex flex-col">
          <label htmlFor="filter-propriedade" className="text-sm font-semibold mb-1">Filtrar por Propriedade:</label>
          <div className="relative">
            <select
              id="filter-propriedade"
              value={filterPropriedade}
              onChange={(e) => setFilterPropriedade(e.target.value)}
              className="w-full p-2 pr-10 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Todas as Propriedades</option>
              {properties.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col">
          <label htmlFor="filter-cultura" className="text-sm font-semibold mb-1">Filtrar por Cultura:</label>
          <div className="relative">
            <select
              id="filter-cultura"
              value={filterCultura}
              onChange={(e) => setFilterCultura(e.target.value)}
              className="w-full p-2 pr-10 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Todas as Culturas</option>
              {cultures.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredReports.length > 0 ? (
          filteredReports.map(report => (
            <div key={report.id} className="bg-white p-4 rounded-xl shadow-md border-l-4 border-green-500 flex flex-col md:flex-row justify-between items-center transition-all duration-200 hover:shadow-lg">
              <div className="text-left w-full md:w-auto mb-4 md:mb-0">
                <p className="text-lg font-bold text-gray-800">{report.dadosPropriedade?.nomePropriedade}</p>
                <p className="text-sm text-gray-600">Cultura: {report.dadosPropriedade?.culturaAcompanhada}</p>
                <p className="text-sm text-gray-600">Data: {report.data.toLocaleDateString()}</p>
                <p className="text-xs text-gray-400">Criado por: {report.creatorEmail || 'Anônimo'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleView(report)}
                  className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 transition-colors duration-200"
                  title="Visualizar"
                >
                  <Eye size={20} />
                </button>
                {/* Only allow editing and deleting own reports */}
                {user?.uid === report.creatorId && (
                  <>
                    <button
                      onClick={() => handleEdit(report)}
                      className="p-2 rounded-full bg-yellow-100 hover:bg-yellow-200 text-yellow-600 transition-colors duration-200"
                      title="Editar"
                    >
                      <Edit size={20} />
                    </button>
                    <button
                      onClick={() => openDeleteModal(report)}
                      className="p-2 rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors duration-200"
                      title="Excluir"
                    >
                      <Trash2 size={20} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 p-8">Nenhum relatório encontrado.</p>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full text-center">
            <h3 className="text-xl font-bold mb-4">Confirmar Exclusão</h3>
            <p className="text-gray-700 mb-6">Tem certeza que deseja excluir o relatório de "{reportToDelete.dadosPropriedade?.nomePropriedade}"?</p>
            <div className="flex justify-around gap-4">
              <button
                onClick={closeModal}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-full transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-full transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ReportFormScreen = ({ isEditing = false }) => {
  const { user, db, setScreen, selectedReport } = useContext(AuthContext);
  const [formData, setFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveMessage, setShowSaveMessage] = useState(false);

  useEffect(() => {
    if (isEditing && selectedReport) {
      setFormData(selectedReport);
    } else {
      setFormData({
        dadosVisita: {},
        dadosPropriedade: {},
        avaliacaoQualidade: {},
        potencialProdutivo: {},
        orientacoesTecnicas: {},
        proximosPassos: {},
      });
    }
  }, [isEditing, selectedReport]);

  const handleChange = (e, section) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [name]: value,
      },
    }));
  };
  
  const handleSave = async (e) => {
    e.preventDefault();
    if (!user?.uid || !db) return;

    setIsSaving(true);
    const reportToSave = {
      ...formData,
      creatorId: user.uid,
      creatorEmail: user.email,
      // Adiciona um carimbo de data/hora para registro.
      dadosVisita: {
        ...formData.dadosVisita,
        dataVisita: Timestamp.now(),
      },
    };

    try {
      if (isEditing && selectedReport) {
        // Update the report in the public collection
        const docRef = doc(db, `artifacts/${appId}/public/data/reports`, selectedReport.id);
        await updateDoc(docRef, reportToSave);
      } else {
        // Add the new report to the public collection
        const reportsCollection = collection(db, `artifacts/${appId}/public/data/reports`);
        await addDoc(reportsCollection, reportToSave);
      }
      setShowSaveMessage(true);
      setTimeout(() => {
        setShowSaveMessage(false);
        setScreen('myReports');
      }, 2000);
    } catch (e) {
      console.error("Erro ao salvar relatório:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePdf = () => {
    const { jsPDF } = window;
    if (typeof jsPDF === 'undefined' || typeof html2canvas === 'undefined') {
      console.error("As bibliotecas jsPDF e html2canvas não foram carregadas.");
      return;
    }

    const input = document.getElementById('report-content');
    if (!input) {
      console.error("Elemento para PDF não encontrado.");
      return;
    }

    html2canvas(input, { scale: 2 }).then(canvas => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
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
      pdf.save(`relatorio_${formData.dadosPropriedade?.nomePropriedade}_${new Date().toLocaleDateString()}.pdf`);
    });
  };

  const handlePrint = () => {
    const content = document.getElementById('report-content');
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>Relatório de Acompanhamento</title>');
    printWindow.document.write('<style>');
    printWindow.document.write(`
      body { font-family: sans-serif; padding: 20px; color: #333; }
      h1, h2, h3 { color: #166534; }
      .section { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #ddd; }
      .label { font-weight: bold; }
      .value { margin-left: 10px; }
      .field-pair { display: flex; flex-wrap: wrap; margin-bottom: 10px; }
      .field { flex: 1 1 45%; margin-right: 10px; }
      .image-container { margin-top: 20px; text-align: center; }
      .image-container img { max-width: 100%; height: auto; border: 1px solid #ddd; }
    `);
    printWindow.document.write('</style></head><body>');
    printWindow.document.write(content.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };


  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-green-700">{isEditing ? 'Editar Relatório' : 'Novo Relatório'}</h2>
        <button
          onClick={() => setScreen(isEditing ? 'myReports' : 'dashboard')}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-full transition-all duration-300 flex items-center gap-1"
        >
          <ArrowLeft size={20} />
          Voltar
        </button>
      </div>

      {showSaveMessage && (
        <div className="fixed inset-0 flex items-center justify-center bg-green-500 bg-opacity-75 z-50 transition-opacity duration-300">
          <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
            <p className="text-2xl font-bold text-green-700">Relatório salvo com sucesso!</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div id="report-content" className="p-4 bg-gray-50 rounded-xl shadow-inner">
          {/* 1. Dados da Visita e do Técnico */}
          <div className="section">
            <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">1. Dados da Visita e do Técnico</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Data da Visita</label>
                <input
                  type="date"
                  name="dataVisita"
                  value={formData.dadosVisita?.dataVisita ? new Date(formData.dadosVisita.dataVisita?.toDate ? formData.dadosVisita.dataVisita.toDate() : formData.dadosVisita.dataVisita).toISOString().substr(0, 10) : ''}
                  onChange={(e) => handleChange(e, 'dadosVisita')}
                  className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Nome do Técnico/Responsável</label>
                <input
                  type="text"
                  name="nomeTecnico"
                  placeholder="Nome do Técnico/Responsável"
                  value={formData.dadosVisita?.nomeTecnico || ''}
                  onChange={(e) => handleChange(e, 'dadosVisita')}
                  className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* 2. Dados da Propriedade */}
          <div className="section">
            <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">2. Dados da Propriedade</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Nome da Propriedade</label>
                <input
                  type="text"
                  name="nomePropriedade"
                  placeholder="Nome da Propriedade"
                  value={formData.dadosPropriedade?.nomePropriedade || ''}
                  onChange={(e) => handleChange(e, 'dadosPropriedade')}
                  className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Contratante</label>
                <input
                  type="text"
                  name="contratante"
                  placeholder="Contratante"
                  value={formData.dadosPropriedade?.contratante || ''}
                  onChange={(e) => handleChange(e, 'dadosPropriedade')}
                  className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Cultura Acompanhada</label>
                <input
                  type="text"
                  name="culturaAcompanhada"
                  placeholder="Cultura Acompanhada"
                  value={formData.dadosPropriedade?.culturaAcompanhada || ''}
                  onChange={(e) => handleChange(e, 'dadosPropriedade')}
                  className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Área Total da(s) Lavouras Visitada(s) (ha/alqueires)</label>
                <input
                  type="text"
                  name="areaTotal"
                  placeholder="Área Total (ha/alqueires)"
                  value={formData.dadosPropriedade?.areaTotal || ''}
                  onChange={(e) => handleChange(e, 'dadosPropriedade')}
                  className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* 3. Avaliação da Qualidade da Lavoura */}
          <div className="section">
            <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">3. Avaliação da Qualidade da Lavoura</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Pragas Identificadas (Nome, Nível de Infestação)</label>
                <textarea
                  name="pragasIdentificadas"
                  placeholder="Pragas Identificadas"
                  value={formData.avaliacaoQualidade?.pragasIdentificadas || ''}
                  onChange={(e) => handleChange(e, 'avaliacaoQualidade')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Doenças Identificadas (Nome, Nível de Incidência)</label>
                <textarea
                  name="doencasIdentificadas"
                  placeholder="Doenças Identificadas"
                  value={formData.avaliacaoQualidade?.doencasIdentificadas || ''}
                  onChange={(e) => handleChange(e, 'avaliacaoQualidade')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Déficits Nutricionais (Sintomas, Deficiência Suspeita)</label>
                <textarea
                  name="deficitsNutricionais"
                  placeholder="Déficits Nutricionais"
                  value={formData.avaliacaoQualidade?.deficitsNutricionais || ''}
                  onChange={(e) => handleChange(e, 'avaliacaoQualidade')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Controle de Plantas Daninhas (Eficiência, Espécies Predominantes)</label>
                <textarea
                  name="controlePlantasDaninhas"
                  placeholder="Controle de Plantas Daninhas"
                  value={formData.avaliacaoQualidade?.controlePlantasDaninhas || ''}
                  onChange={(e) => handleChange(e, 'avaliacaoQualidade')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Aspectos Físicos do Solo</label>
                <textarea
                  name="aspectosFisicosSolo"
                  placeholder="Aspectos Físicos do Solo"
                  value={formData.avaliacaoQualidade?.aspectosFisicosSolo || ''}
                  onChange={(e) => handleChange(e, 'avaliacaoQualidade')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Outras Observações de Qualidade</label>
                <textarea
                  name="outrasObservacoesQualidade"
                  placeholder="Outras Observações"
                  value={formData.avaliacaoQualidade?.outrasObservacoesQualidade || ''}
                  onChange={(e) => handleChange(e, 'avaliacaoQualidade')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
            </div>
          </div>
          
          {/* 4. Potencial Produtivo da Lavoura */}
          <div className="section">
            <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">4. Potencial Produtivo da Lavoura</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Estimativa de Produção (Atual/Revisada)</label>
                <textarea
                  name="estimativaProducao"
                  placeholder="Estimativa de Produção"
                  value={formData.potencialProdutivo?.estimativaProducao || ''}
                  onChange={(e) => handleChange(e, 'potencialProdutivo')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Fatores Limitantes Observados</label>
                <textarea
                  name="fatoresLimitantes"
                  placeholder="Fatores Limitantes"
                  value={formData.potencialProdutivo?.fatoresLimitantes || ''}
                  onChange={(e) => handleChange(e, 'potencialProdutivo')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Fatores Favoráveis Observados</label>
                <textarea
                  name="fatoresFavoraveis"
                  placeholder="Fatores Favoráveis"
                  value={formData.potencialProdutivo?.fatoresFavoraveis || ''}
                  onChange={(e) => handleChange(e, 'potencialProdutivo')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
            </div>
          </div>

          {/* 5. Orientações Técnicas Fornecidas ao Corpo Gerencial */}
          <div className="section">
            <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">5. Orientações Técnicas Fornecidas ao Corpo Gerencial</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Recomendações para Próximos Dias/Semana</label>
                <textarea
                  name="recomendacoesProximosDias"
                  placeholder="Recomendações para Próximos Dias/Semana"
                  value={formData.orientacoesTecnicas?.recomendacoesProximosDias || ''}
                  onChange={(e) => handleChange(e, 'orientacoesTecnicas')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Manejo Fitossanitário (Produto, Dose, Momento)</label>
                <textarea
                  name="manejoFitossanitario"
                  placeholder="Manejo Fitossanitario"
                  value={formData.orientacoesTecnicas?.manejoFitossanitario || ''}
                  onChange={(e) => handleChange(e, 'orientacoesTecnicas')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Manejo Nutricional (Fertilizante, Dose, Momento)</label>
                <textarea
                  name="manejoNutricional"
                  placeholder="Manejo Nutricional"
                  value={formData.orientacoesTecnicas?.manejoNutricional || ''}
                  onChange={(e) => handleChange(e, 'orientacoesTecnicas')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Manejo Cultural (Rotação, Preparo de Solo, etc.)</label>
                <textarea
                  name="manejoCultural"
                  placeholder="Manejo Cultural"
                  value={formData.orientacoesTecnicas?.manejoCultural || ''}
                  onChange={(e) => handleChange(e, 'orientacoesTecnicas')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Outras Recomendações</label>
                <textarea
                  name="outrasRecomendacoes"
                  placeholder="Outras Recomendações"
                  value={formData.orientacoesTecnicas?.outrasRecomendacoes || ''}
                  onChange={(e) => handleChange(e, 'orientacoesTecnicas')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
            </div>
          </div>
          
          {/* 6. Próximos Passos e Ações de Acompanhamento */}
          <div className="section">
            <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">6. Próximos Passos e Ações de Acompanhamento</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Data Sugerida para Próxima Visita</label>
                <input
                  type="date"
                  name="dataProximaVisita"
                  value={formData.proximosPassos?.dataProximaVisita || ''}
                  onChange={(e) => handleChange(e, 'proximosPassos')}
                  className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-1">Ações a Serem Verificadas na Próxima Visita</label>
                <textarea
                  name="acoesVerificar"
                  placeholder="Ações a Serem Verificadas"
                  value={formData.proximosPassos?.acoesVerificar || ''}
                  onChange={(e) => handleChange(e, 'proximosPassos')}
                  className="w-full p-3 rounded-lg border border-gray-300 h-24 resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-between items-center gap-4">
          <button
            type="button"
            onClick={() => setScreen('dashboard')}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-6 rounded-full shadow-md transition-all duration-300 transform hover:scale-105"
          >
            <XCircle size={20} />
            Cancelar
          </button>
          
          <div className="flex flex-1 justify-end gap-4">
            <button
              type="button"
              onClick={handleGeneratePdf}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-full shadow-md transition-all duration-300 transform hover:scale-105"
            >
              <Download size={20} />
              Gerar PDF
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-6 rounded-full shadow-md transition-all duration-300 transform hover:scale-105"
            >
              <Printer size={20} />
              Imprimir
            </button>
            <button
              type="submit"
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-8 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105"
              disabled={isSaving}
            >
              {isSaving ? 'Salvando...' : 'Salvar Relatório'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

const ReportViewScreen = () => {
  const { selectedReport, setScreen } = useContext(AuthContext);

  if (!selectedReport) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-500">Nenhum relatório selecionado para visualização.</p>
        <button
          onClick={() => setScreen('myReports')}
          className="mt-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-full"
        >
          <ArrowLeft size={20} />
          Voltar
        </button>
      </div>
    );
  }

  const {
    dadosVisita,
    dadosPropriedade,
    avaliacaoQualidade,
    potencialProdutivo,
    orientacoesTecnicas,
    proximosPassos,
  } = selectedReport;

  const dataVisitaFormatada = dadosVisita?.dataVisita?.toDate ? dadosVisita.dataVisita.toDate().toLocaleDateString() : 'N/A';
  
  const handleGeneratePdf = () => {
    // Check if the libraries are loaded
    const { jsPDF } = window;
    if (typeof jsPDF === 'undefined' || typeof html2canvas === 'undefined') {
      console.error("As bibliotecas jsPDF e html2canvas não foram carregadas.");
      return;
    }

    const input = document.getElementById('report-content');
    if (!input) {
      console.error("Elemento para PDF não encontrado.");
      return;
    }

    html2canvas(input, { scale: 2 }).then(canvas => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
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
      pdf.save(`relatorio_${dadosPropriedade?.nomePropriedade}_${new Date().toLocaleDateString()}.pdf`);
    });
  };

  const handlePrint = () => {
    const content = document.getElementById('report-content');
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>Relatório de Acompanhamento</title>');
    printWindow.document.write('<style>');
    printWindow.document.write(`
      body { font-family: sans-serif; padding: 20px; color: #333; }
      h1, h2, h3 { color: #166534; }
      .section { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #ddd; }
      .label { font-weight: bold; }
      .value { margin-left: 10px; }
      .field-pair { display: flex; flex-wrap: wrap; margin-bottom: 10px; }
      .field { flex: 1 1 45%; margin-right: 10px; }
      .image-container { margin-top: 20px; text-align: center; }
      .image-container img { max-width: 100%; height: auto; border: 1px solid #ddd; }
    `);
    printWindow.document.write('</style></head><body>');
    printWindow.document.write(content.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="p-4 relative">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-green-700">Visualizar Relatório</h2>
        <button
          onClick={() => setScreen('myReports')}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-full transition-all duration-300 flex items-center gap-1"
        >
          <ArrowLeft size={20} />
          Voltar
        </button>
      </div>

      <div id="report-content" className="space-y-6">
        {/* 1. Dados da Visita e do Técnico */}
        <div className="bg-gray-50 p-4 rounded-xl shadow-inner">
          <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">1. Dados da Visita e do Técnico</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><span className="font-semibold">Data da Visita:</span> {dataVisitaFormatada}</div>
            <div><span className="font-semibold">Nome do Técnico/Responsável:</span> {dadosVisita?.nomeTecnico || 'N/A'}</div>
          </div>
        </div>

        {/* 2. Dados da Propriedade */}
        <div className="bg-gray-50 p-4 rounded-xl shadow-inner">
          <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">2. Dados da Propriedade</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><span className="font-semibold">Nome da Propriedade:</span> {dadosPropriedade?.nomePropriedade || 'N/A'}</div>
            <div><span className="font-semibold">Contratante:</span> {dadosPropriedade?.contratante || 'N/A'}</div>
            <div><span className="font-semibold">Cultura Acompanhada:</span> {dadosPropriedade?.culturaAcompanhada || 'N/A'}</div>
            <div><span className="font-semibold">Área Total da(s) Lavouras Visitada(s) (ha/alqueires):</span> {dadosPropriedade?.areaTotal || 'N/A'}</div>
          </div>
        </div>
        
        {/* 3. Avaliação da Qualidade da Lavoura */}
        <div className="bg-gray-50 p-4 rounded-xl shadow-inner">
          <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">3. Avaliação da Qualidade da Lavoura</h3>
          <div className="space-y-2">
            <p><span className="font-semibold">Pragas Identificadas (Nome, Nível de Infestação):</span> {avaliacaoQualidade?.pragasIdentificadas || 'N/A'}</p>
            <p><span className="font-semibold">Doenças Identificadas (Nome, Nível de Incidência):</span> {avaliacaoQualidade?.doencasIdentificadas || 'N/A'}</p>
            <p><span className="font-semibold">Déficits Nutricionais (Sintomas, Deficiência Suspeita):</span> {avaliacaoQualidade?.deficitsNutricionais || 'N/A'}</p>
            <p><span className="font-semibold">Controle de Plantas Daninhas (Eficiência, Espécies Predominantes):</span> {avaliacaoQualidade?.controlePlantasDaninhas || 'N/A'}</p>
            <p><span className="font-semibold">Aspectos Físicos do Solo:</span> {avaliacaoQualidade?.aspectosFisicosSolo || 'N/A'}</p>
            <p><span className="font-semibold">Outras Observações de Qualidade:</span> {avaliacaoQualidade?.outrasObservacoesQualidade || 'N/A'}</p>
          </div>
        </div>

        {/* 4. Potencial Produtivo da Lavoura */}
        <div className="bg-gray-50 p-4 rounded-xl shadow-inner">
          <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">4. Potencial Produtivo da Lavoura</h3>
          <div className="space-y-2">
            <p><span className="font-semibold">Estimativa de Produção (Atual/Revisada):</span> {potencialProdutivo?.estimativaProducao || 'N/A'}</p>
            <p><span className="font-semibold">Fatores Limitantes Observados:</span> {potencialProdutivo?.fatoresLimitantes || 'N/A'}</p>
            <p><span className="font-semibold">Fatores Favoráveis Observados:</span> {potencialProdutivo?.fatoresFavoraveis || 'N/A'}</p>
          </div>
        </div>
        
        {/* 5. Orientações Técnicas Fornecidas ao Corpo Gerencial */}
        <div className="bg-gray-50 p-4 rounded-xl shadow-inner">
          <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">5. Orientações Técnicas Fornecidas ao Corpo Gerencial</h3>
          <div className="space-y-2">
            <p><span className="font-semibold">Recomendações para Próximos Dias/Semana:</span> {orientacoesTecnicas?.recomendacoesProximosDias || 'N/A'}</p>
            <p><span className="font-semibold">Manejo Fitossanitário (Produto, Dose, Momento):</span> {orientacoesTecnicas?.manejoFitossanitario || 'N/A'}</p>
            <p><span className="font-semibold">Manejo Nutricional (Fertilizante, Dose, Momento):</span> {orientacoesTecnicas?.manejoNutricional || 'N/A'}</p>
            <p><span className="font-semibold">Manejo Cultural (Rotação, Preparo de Solo, etc.):</span> {orientacoesTecnicas?.manejoCultural || 'N/A'}</p>
            <p><span className="font-semibold">Outras Recomendações:</span> {orientacoesTecnicas?.outrasRecomendacoes || 'N/A'}</p>
          </div>
        </div>

        {/* 6. Próximos Passos e Ações de Acompanhamento */}
        <div className="bg-gray-50 p-4 rounded-xl shadow-inner">
          <h3 className="text-xl font-semibold text-green-800 mb-4 border-b-2 border-green-200 pb-2">6. Próximos Passos e Ações de Acompanhamento</h3>
          <div className="space-y-2">
            <p><span className="font-semibold">Data Sugerida para Próxima Visita:</span> {proximosPassos?.dataProximaVisita || 'N/A'}</p>
            <p><span className="font-semibold">Ações a Serem Verificadas na Próxima Visita:</span> {proximosPassos?.acoesVerificar || 'N/A'}</p>
          </div>
        </div>
      </div>
      
      <div className="mt-8 flex flex-wrap justify-between items-center gap-4 print:hidden">
          <button
            onClick={() => setScreen('myReports')}
            className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-6 rounded-full shadow-md transition-all duration-300 transform hover:scale-105"
          >
            <ArrowLeft size={20} />
            Voltar
          </button>
          <div className="flex flex-1 justify-end gap-4">
            <button
              onClick={handleGeneratePdf}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-full shadow-md transition-all duration-300 transform hover:scale-105"
            >
              <Download size={20} />
              Gerar PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-6 rounded-full shadow-md transition-all duration-300 transform hover:scale-105"
            >
              <Printer size={20} />
              Imprimir
            </button>
          </div>
      </div>
    </div>
  );
};

export default App;
