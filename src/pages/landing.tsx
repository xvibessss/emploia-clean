import { Link } from "wouter";
import { motion } from "framer-motion";
import { FileText, Briefcase, Target, CheckCircle, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui-blocks";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background overflow-hidden selection:bg-primary/20">
      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 glass-panel border-b-0 border-t-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-3">
              <img 
                src={`${import.meta.env.BASE_URL}images/logo.png`} 
                alt="EmploiA Logo" 
                className="w-10 h-10 rounded-xl shadow-sm"
              />
              <span className="text-2xl font-bold font-display text-foreground">
                Emploi<span className="text-primary">IA</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
                Connexion
              </Link>
              <Link href="/register">
                <Button size="sm">Essai gratuit</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Background" 
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/50 to-background"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm mb-6 border border-primary/20">
              <Sparkles className="w-4 h-4" />
              L'IA au service de votre carrière
            </span>
            <h1 className="text-5xl lg:text-7xl font-bold text-foreground mb-6 leading-tight">
              Décrochez l'emploi de <br className="hidden lg:block" />
              <span className="text-gradient">vos rêves avec l'IA</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Générez des CV sur-mesure, des lettres de motivation percutantes et passez les filtres ATS des recruteurs en quelques secondes.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" className="w-full group">
                  Commencer gratuitement
                  <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <p className="text-sm text-muted-foreground sm:hidden">Aucune carte requise</p>
            </div>
            <p className="text-sm text-muted-foreground mt-4 hidden sm:block">5 générations offertes • Aucune carte bancaire requise</p>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">Une suite d'outils complète</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Tout ce dont vous avez besoin pour maximiser vos chances d'obtenir un entretien.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div 
              whileHover={{ y: -5 }}
              className="bg-background rounded-3xl p-8 border border-border/50 shadow-lg shadow-black/5"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mb-6">
                <FileText className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">CV Optimisé ATS</h3>
              <p className="text-muted-foreground">Adaptez instantanément votre CV aux mots-clés exacts de l'offre d'emploi pour passer les filtres automatiques.</p>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              className="bg-background rounded-3xl p-8 border border-border/50 shadow-lg shadow-black/5"
            >
              <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mb-6">
                <Briefcase className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">Lettre de motivation</h3>
              <p className="text-muted-foreground">Une lettre unique, personnalisée et percutante qui met en valeur votre profil par rapport aux attentes du recruteur.</p>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              className="bg-background rounded-3xl p-8 border border-border/50 shadow-lg shadow-black/5"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mb-6">
                <Target className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">Score ATS</h3>
              <p className="text-muted-foreground">Évaluez la compatibilité de votre candidature avant de l'envoyer et recevez des conseils d'amélioration concrets.</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 bg-background relative z-10 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">Des tarifs simples</h2>
            <p className="text-lg text-muted-foreground">Investissez dans votre avenir professionnel.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free */}
            <div className="bg-white rounded-3xl p-8 border border-border shadow-lg">
              <h3 className="text-2xl font-bold mb-2">Découverte</h3>
              <div className="text-4xl font-display font-bold mb-6">0€ <span className="text-lg text-muted-foreground font-normal font-sans">/mois</span></div>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-primary" /> 5 générations offertes</li>
                <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-primary" /> CV sur-mesure</li>
                <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-primary" /> Lettre de motivation</li>
              </ul>
              <Link href="/register" className="block w-full">
                <Button variant="outline" className="w-full">Commencer gratuitement</Button>
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-primary rounded-3xl p-8 border border-primary-dark shadow-2xl relative overflow-hidden text-white">
              <div className="absolute top-0 right-0 p-4">
                <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md">Populaire</span>
              </div>
              <h3 className="text-2xl font-bold mb-2 text-white">Pro</h3>
              <div className="text-4xl font-display font-bold mb-6 text-white">19€ <span className="text-lg text-white/70 font-normal font-sans">/mois</span></div>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-white" /> Générations illimitées</li>
                <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-white" /> Score ATS avancé</li>
                <li className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-white" /> Support prioritaire</li>
              </ul>
              <Button className="w-full bg-white text-primary hover:bg-white/90 hover:shadow-white/20">Devenir Pro</Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold font-display">Emploi<span className="text-primary">IA</span></span>
          </div>
          <p className="text-muted-foreground text-sm">© 2025 EmploiA. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
