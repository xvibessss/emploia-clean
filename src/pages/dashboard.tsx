import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  useGenerateCv, 
  useGenerateCoverLetter, 
  useGenerateAtsScore 
} from "@/lib/api-client";
import { Button, Textarea, Card } from "@/components/ui-blocks";
import { 
  LogOut, Crown, Copy, Check, FileText, Briefcase, Target, 
  AlertCircle, Sparkles 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Tab = 'cv' | 'letter' | 'ats';

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: isAuthLoading, logout } = useAuth();
  
  const [activeTab, setActiveTab] = useState<Tab>('cv');
  const [jobOffer, setJobOffer] = useState("");
  const [profile, setProfile] = useState("");
  const [cvText, setCvText] = useState("");
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const cvMutation = useGenerateCv();
  const letterMutation = useGenerateCoverLetter();
  const atsMutation = useGenerateAtsScore();

  // Protect route
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthLoading, isAuthenticated, setLocation]);

  if (isAuthLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;
  }

  const isPending = cvMutation.isPending || letterMutation.isPending || atsMutation.isPending;

  const handleGenerate = () => {
    setErrorMsg("");
    setResult("");

    const handleError = (err: any) => {
      const msg = err.error || err.message || "";
      if (err.status === 402 || msg.includes('402') || msg.includes('Limite')) {
        setShowUpgradeModal(true);
      } else {
        setErrorMsg(msg || "Une erreur est survenue lors de la génération.");
      }
    };

    if (activeTab === 'cv') {
      if (!jobOffer || !profile) return setErrorMsg("Veuillez remplir tous les champs.");
      cvMutation.mutate({ data: { jobOffer, profile } }, {
        onSuccess: (data) => setResult(data.result),
        onError: handleError
      });
    } else if (activeTab === 'letter') {
      if (!jobOffer || !profile) return setErrorMsg("Veuillez remplir tous les champs.");
      letterMutation.mutate({ data: { jobOffer, profile } }, {
        onSuccess: (data) => setResult(data.result),
        onError: handleError
      });
    } else {
      if (!jobOffer || !cvText) return setErrorMsg("Veuillez remplir tous les champs.");
      atsMutation.mutate({ data: { jobOffer, cvText } }, {
        onSuccess: (data) => setResult(data.result),
        onError: handleError
      });
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 rounded-lg" />
            <span className="font-display font-bold text-xl hidden sm:block">EmploiA</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 mr-4 border-r border-border pr-4">
              <span className="text-sm font-medium text-foreground">{user.name}</span>
              {user.plan === 'pro' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
                  <Crown className="w-3 h-3" /> PRO
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
                  {user.generationsUsed} / 5
                </span>
              )}
            </div>
            <button 
              onClick={logout}
              className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
              title="Se déconnecter"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* Tab Navigation */}
        <div className="flex p-1 bg-white border border-border rounded-xl w-full sm:w-fit mx-auto mb-8 shadow-sm">
          <button 
            onClick={() => { setActiveTab('cv'); setResult(''); }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'cv' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-gray-50'}`}
          >
            <FileText className="w-4 h-4" /> <span className="hidden sm:inline">Générer un CV</span>
          </button>
          <button 
            onClick={() => { setActiveTab('letter'); setResult(''); }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'letter' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-gray-50'}`}
          >
            <Briefcase className="w-4 h-4" /> <span className="hidden sm:inline">Lettre de motivation</span>
          </button>
          <button 
            onClick={() => { setActiveTab('ats'); setResult(''); }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'ats' ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-gray-50'}`}
          >
            <Target className="w-4 h-4" /> <span className="hidden sm:inline">Score ATS</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Input Area */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold font-display flex items-center gap-2">
              {activeTab === 'cv' && "Création de CV"}
              {activeTab === 'letter' && "Rédaction de Lettre"}
              {activeTab === 'ats' && "Analyse ATS"}
              <Sparkles className="w-5 h-5 text-primary" />
            </h2>
            
            {errorMsg && (
              <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium flex items-start gap-3 border border-destructive/20">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{errorMsg}</p>
              </div>
            )}

            <Card className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Offre d'emploi (description)</label>
                <Textarea 
                  rows={6}
                  placeholder="Collez la description du poste ici pour que l'IA puisse s'y adapter parfaitement..."
                  value={jobOffer}
                  onChange={(e) => setJobOffer(e.target.value)}
                />
              </div>

              {activeTab === 'ats' ? (
                <div>
                  <label className="block text-sm font-semibold mb-2">Votre CV actuel</label>
                  <Textarea 
                    rows={8}
                    placeholder="Collez le texte de votre CV actuel pour l'analyse..."
                    value={cvText}
                    onChange={(e) => setCvText(e.target.value)}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold mb-2">Votre profil / Expériences</label>
                  <Textarea 
                    rows={8}
                    placeholder="Résumez votre parcours, compétences, ou collez votre CV actuel..."
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                  />
                </div>
              )}

              <Button 
                onClick={handleGenerate} 
                className="w-full mt-4" 
                size="lg"
                isLoading={isPending}
              >
                Générer avec l'IA
              </Button>
            </Card>
          </div>

          {/* Result Area */}
          <div className="lg:h-[calc(100vh-12rem)] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold font-display text-muted-foreground">Résultat</h2>
              {result && (
                <Button variant="outline" size="sm" onClick={handleCopy} className="h-9">
                  {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? "Copié !" : "Copier le texte"}
                </Button>
              )}
            </div>
            
            <Card className="flex-1 overflow-hidden p-0 flex flex-col border-dashed bg-gray-50/50">
              {isPending ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
                  <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
                  <p className="font-medium animate-pulse">L'IA rédige votre document...</p>
                </div>
              ) : result ? (
                <div className="flex-1 overflow-y-auto p-6 bg-white">
                  <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800">
                    {result}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-gray-300" />
                  </div>
                  <p>Remplissez les champs à gauche et cliquez sur Générer pour voir le résultat ici.</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>

      {/* Upgrade Modal Overlay */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-primary to-blue-400"></div>
              
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Crown className="w-8 h-8" />
              </div>
              
              <h3 className="text-2xl font-bold text-center mb-2 font-display">Limite atteinte</h3>
              <p className="text-center text-muted-foreground mb-8">
                Vous avez utilisé vos 5 générations gratuites. Passez au plan Pro pour débloquer l'accès illimité et booster votre recherche d'emploi.
              </p>
              
              <div className="space-y-3">
                {/* Normally this would link to Stripe Checkout via API, mapping to a dummy action for now */}
                <Button className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 shadow-amber-500/25">
                  Passer Pro pour 19€/mois
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setShowUpgradeModal(false)}>
                  Peut-être plus tard
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
