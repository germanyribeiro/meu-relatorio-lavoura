import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';

// Importar ícones do Lucide React
import { PlusCircle, Edit, Trash2, List, FileText, XCircle, Camera, Save, Loader2, Eye } from 'lucide-react';

// As bibliotecas jsPDF e html2canvas serão carregadas via CDN no index.html.
// Removendo os imports diretos para evitar erros de "Could not resolve" no ambiente de compilação.
// Certifique-se de adicionar as seguintes tags <script> no <head> ou no <body> do seu public/index.html:
// <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
// <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
import PropTypes from 'prop-types';

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null); // eslint-disable-line no-unused-vars
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState('list'); // 'list', 'create', 'edit', 'view'
  const [currentReport, setCurrentReport] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Firebase Initialization and Authentication
  useEffect(() => {
    try {
      // Declarando __app_id e __initial_auth_token para que o ESLint os reconheça
      // Eles são injetados globalmente pelo ambiente Canvas, mas esta declaração
      // garante que o linter não reclame de "não definidos".
      // Usando 'window.' para acessar variáveis globais de forma explícita.
      const currentAppId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id'; // eslint-disable-line no-unused-vars
      const initialAuthToken = typeof window.__initial_auth_token !== 'undefined' ? window.__initial_auth_token : '';
      const firebaseConfig = {
        apiKey: "AIzaSyBwlHn7CommvM6psGiXjwN3AWYemiJ9uj4",
        authDomain: "lavourasapp.firebaseapp.com",
        projectId: "lavourasapp",
        storageBucket: "lavourasapp.firebasestorage.app",
        messagingSenderId: "576349607032",
        appId: "1:576349607032:web:3a36527be7aaf7ee2ec98d",
        measurementId: "G-W5CJR02XDX"
      };

      if (!Object.keys(firebaseConfig).length) {
        throw new Error("Firebase config is missing. Please ensure __firebase_config is provided.");
      }

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          try {
            // Tenta fazer login com o token personalizado se disponível
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              // Volta para o login anônimo se não houver token personalizado
              await signInAnonymously(firebaseAuth);
            }
          } catch (signInError) {
            console.error("Erro ao autenticar no Firebase:", signInError);
            setError("Erro ao autenticar no Firebase. Por favor, tente novamente.");
            // Gera um UUID aleatório para userId se a autenticação falhar
            setUserId(crypto.randomUUID());
            setIsAuthReady(true); // Ainda define como true para permitir que o aplicativo prossiga
          }
        }
        setLoading(false);
      });

      return () => unsubscribe();
    }
    catch (err) {
      console.error("Erro na inicialização do Firebase:", err);
      setError(`Erro na inicialização do Firebase: ${err.message}`);
      setLoading(false);
    }
  }, []);

  // Fetch reports when auth is ready and db is available
  useEffect(() => {
    if (db && userId && isAuthReady) {
      // Redefine para uso aqui, usando window para consistência com a declaração acima
      const currentAppId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
      const reportsCollectionRef = collection(db, `artifacts/${currentAppId}/users/${userId}/relatoriosLavouras`);
      // Note: orderBy is commented out to avoid potential index issues as per instructions.
      // const q = query(reportsCollectionRef, orderBy('createdAt', 'desc'));
      const q = query(reportsCollectionRef); // Fetch all and sort in memory

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedReports = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort in memory by createdAt if available, otherwise by dataVisita
        fetchedReports.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.dataVisita);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.dataVisita);
          return dateB - dateA; // Descending order
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
  }, [db, userId, isAuthReady]);

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
    // Define currentAppId para uso aqui
    const currentAppId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
    if (window.confirm("Tem certeza que deseja excluir este relatório?")) { // Using window.confirm for simplicity, but in a real app, use a custom modal.
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
    // Define currentAppId para uso aqui
    const currentAppId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
    try {
      if (reportData.id) {
        // Update existing report
        const { id, ...dataToUpdate } = reportData;
        await updateDoc(doc(db, `artifacts/${currentAppId}/users/${userId}/relatoriosLavouras`, id), {
          ...dataToUpdate,
          updatedAt: serverTimestamp()
        });
        console.log("Relatório atualizado com sucesso!");
      } else {
        // Add new report
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

  // Função para gerar o PDF (agora no App para ser reutilizável)
  const generatePdfFromReportData = async (reportData, contentRef) => {
    if (!contentRef.current) {
      console.error("Conteúdo do relatório não encontrado para gerar PDF.");
      return;
    }

    // Verifica se as bibliotecas estão disponíveis globalmente
    if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
      console.error("Bibliotecas jsPDF ou html2canvas não carregadas. Certifique-se de que as tags <script> estão no index.html.");
      alert("Erro: As bibliotecas de PDF não foram carregadas. Por favor, recarregue a página e verifique a conexão.");
      return;
    }

    // Cria um div temporário para renderizar o conteúdo e evitar conflitos com o DOM do React
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px'; // Move para fora da tela
    tempDiv.style.width = contentRef.current.offsetWidth + 'px'; // Mantém a largura do elemento original
    tempDiv.style.height = contentRef.current.offsetHeight + 'px'; // Mantém a altura do elemento original
    tempDiv.style.overflow = 'hidden'; // Esconde o conteúdo extra

    // Clona o conteúdo do relatório para o div temporário
    const clonedContent = contentRef.current.cloneNode(true);
    tempDiv.appendChild(clonedContent);
    document.body.appendChild(tempDiv);

    try {
      // Usando html2canvas da biblioteca global
      const canvas = await window.html2canvas(clonedContent, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');

      // Usando jsPDF da biblioteca global
      const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = canvas.height * imgWidth / canvas.width;
      let heightLeft = imgHeight;
      let position = 0; // Inicializa a posição

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `Relatorio_Lavoura_${reportData.propriedade.replace(/\s/g, '_')}_${reportData.dataVisita}.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Erro ao gerar PDF. Por favor, tente novamente."); // Usando alert para simplificar, mas em app real use modal customizado
    } finally {
      // Remove o div temporário do DOM
      if (document.body.contains(tempDiv)) {
        document.body.removeChild(tempDiv);
      }
    }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 font-inter text-gray-800 p-4 sm:p-6 lg:p-8">
      <header className="bg-white p-4 sm:p-6 rounded-2xl shadow-lg mb-6 flex flex-col items-center text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-green-700 mb-2">
          🌱 Relatórios de Lavouras
        </h1>
        <span className="text-sm text-gray-600 mb-4">ID do Usuário: <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded-md">{userId}</span></span>
        <button
          onClick={handleCreateNewReport}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-xl shadow-md hover:bg-green-700 transition duration-300 ease-in-out transform hover:scale-105 mt-6"
        >
          <PlusCircle className="w-5 h-5 mr-2" />
          Novo Relatório
        </button>
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
          />
        )}
        {view === 'view' && currentReport && (
          <ReportView
            report={currentReport}
            onCancel={() => { setView('list'); setCurrentReport(null); }}
            onGeneratePdf={generatePdfFromReportData}
          />
        )}
      </main>
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

const ReportForm = ({ report, onSave, onCancel, isEditing, onGeneratePdf }) => {
  const [formData, setFormData] = useState({
    propriedade: '',
    lavoura: '',
    dataVisita: new Date().toISOString().split('T')[0], // Default to today
    condicoesClimaticas: '',
    estagioFenologico: '',
    observacoesGerais: '',
    problemasIdentificados: '',
    orientacoesTecnicas: '',
    potencialProdutivo: '',
    responsavelTecnico: '', // Novo campo
    fotos: [], // Array of image URLs
    ...report, // Pre-fill if editing
  });

  const [loadingPdf, setLoadingPdf] = useState(false);
  const reportContentRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddPhoto = () => {
    const imageUrl = prompt("Por favor, insira a URL da imagem (ou dados Base64):");
    if (imageUrl) {
      setFormData(prev => ({
        ...prev,
        fotos: [...prev.fotos, imageUrl]
      }));
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
    await onGeneratePdf(formData, reportContentRef);
    setLoadingPdf(false);
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center">
        {isEditing ? <Edit className="w-6 h-6 mr-2" /> : <FileText className="w-6 h-6 mr-2" />}
        {isEditing ? 'Editar Relatório' : 'Novo Relatório'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Conteúdo do formulário que será capturado para o PDF */}
        {/* Margens ABNT aproximadas: Esquerda 3cm (px-28), Direita 2cm (px-20), Topo 3cm (py-20), Rodapé 2cm (py-20) */}
        <div ref={reportContentRef} className="px-28 py-20 border border-gray-200 rounded-xl bg-gray-50 space-y-4">
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
            {/* Novo campo: Responsável Técnico */}
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
            <p className="text-lg text-gray-600 mb-3">
              Adicione fotos colando a URL da imagem. (Não é possível acessar a câmera do dispositivo diretamente neste ambiente).
            </p>
            <button
              type="button"
              onClick={handleAddPhoto}
              className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 transition duration-300 ease-in-out transform hover:scale-105 mb-4"
            >
              <PlusCircle className="w-5 h-5 mr-2" />
              Adicionar Foto (URL)
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {formData.fotos.map((photoUrl, index) => (
                <div key={index} className="relative group rounded-lg overflow-hidden shadow-sm aspect-w-16 aspect-h-9">
                  <img
                    src={photoUrl}
                    alt={`Foto da lavoura ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `https://placehold.co/150x150/cccccc/333333?text=Erro+ao+Carregar+Imagem`;
                    }}
                  />
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
        </div> {/* Fim do div com ref */}

        <div className="flex justify-end space-x-4 mt-8">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg shadow-sm hover:bg-gray-100 transition duration-300 ease-in-out"
          >
            <XCircle className="w-5 h-5 mr-2" />
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

// Adicionando PropTypes para ReportForm
ReportForm.propTypes = {
  report: PropTypes.object, // Pode ser nulo para novos relatórios
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  isEditing: PropTypes.bool.isRequired,
  onGeneratePdf: PropTypes.func.isRequired,
};

const ReportView = ({ report, onCancel, onGeneratePdf }) => {
  const reportContentRef = useRef(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const handleGeneratePdfClick = async () => {
    setLoadingPdf(true);
    await onGeneratePdf(report, reportContentRef);
    setLoadingPdf(false);
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-green-800 mb-6 flex items-center">
        <Eye className="w-6 h-6 mr-2" />
        Detalhes do Relatório
      </h2>
      {/* Margens ABNT aproximadas: Esquerda 3cm (px-28), Direita 2cm (px-20), Topo 3cm (py-20), Rodapé 2cm (py-20) */}
      <div ref={reportContentRef} className="px-28 py-20 border border-gray-200 rounded-xl bg-gray-50 mb-6 space-y-4">
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
          {/* Novo campo: Responsável Técnico */}
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
            <p className="text-lg text-gray-600 mb-3">
              Adicione fotos colando a URL da imagem. (Não é possível acessar a câmera do dispositivo diretamente neste ambiente).
            </p>
            <button
              type="button"
              onClick={handleAddPhoto}
              className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg shadow-md hover:bg-purple-700 transition duration-300 ease-in-out transform hover:scale-105 mb-4"
            >
              <PlusCircle className="w-5 h-5 mr-2" />
              Adicionar Foto (URL)
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {formData.fotos.map((photoUrl, index) => (
                <div key={index} className="relative group rounded-lg overflow-hidden shadow-sm aspect-w-16 aspect-h-9">
                  <img
                    src={photoUrl}
                    alt={`Foto da lavoura ${index + 1}`}
                    className="w-full h-full object-cover"
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

      <div className="flex justify-end space-x-4">
        <button
          onClick={onCancel}
          className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg shadow-sm hover:bg-gray-100 transition duration-300 ease-in-out"
        >
          <XCircle className="w-5 h-5 mr-2" />
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

// Adicionando PropTypes para ReportView
ReportView.propTypes = {
  report: PropTypes.object.isRequired,
  onCancel: PropTypes.func.isRequired,
  onGeneratePdf: PropTypes.func.isRequired,
};

export default App;
