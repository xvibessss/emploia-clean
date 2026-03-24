import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { Button, Input, Card } from "@/components/ui-blocks";
import { Mail, Lock, User, ArrowRight, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const registerMutation = useRegister({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        setErrorMsg(err.error || err.message || "Erreur lors de l'inscription");
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!name || !email || !password) return;
    registerMutation.mutate({ data: { name, email, password } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-0 w-full h-96 bg-primary/5 rounded-b-[100%] blur-3xl -z-10"></div>
      
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center mb-6">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-12 h-12 rounded-xl shadow-sm" />
          </Link>
          <h1 className="text-3xl font-bold text-foreground font-display">Créer un compte</h1>
          <p className="text-muted-foreground mt-2">Rejoignez EmploiA gratuitement</p>
        </div>

        <Card className="border-t-4 border-t-primary">
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {errorMsg}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Nom complet</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  type="text" 
                  placeholder="Jean Dupont" 
                  className="pl-10"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  type="email" 
                  placeholder="vous@exemple.com" 
                  className="pl-10"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  type="password" 
                  placeholder="Au moins 8 caractères" 
                  className="pl-10"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full mt-2" isLoading={registerMutation.isPending}>
              S'inscrire
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Déjà un compte ?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline inline-flex items-center">
            Se connecter <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </p>
      </div>
    </div>
  );
}
