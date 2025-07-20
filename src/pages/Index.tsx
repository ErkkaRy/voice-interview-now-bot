import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Bot, FileText, Clock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import InterviewCreator from "@/components/InterviewCreator";
import InterviewLauncher from "@/components/InterviewLauncher";
import VoiceChat from "@/components/VoiceChat";

const Index = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentView, setCurrentView] = useState("dashboard"); // dashboard, create-interview
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [registerData, setRegisterData] = useState({ email: "", password: "", name: "" });
  const [interviews, setInterviews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingInterview, setEditingInterview] = useState<any>(null);
  const { toast } = useToast();

  const fetchInterviews = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-interviews');
      if (error) throw error;
      setInterviews(data.interviews || []);
    } catch (error) {
      console.error('Error fetching interviews:', error);
      toast({
        title: "Virhe",
        description: "Haastattelujen lataaminen epäonnistui.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInterviews();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.email && loginData.password) {
      setIsLoggedIn(true);
      toast({
        title: "Kirjautuminen onnistui!",
        description: "Tervetuloa AI-haastattelupalveluun.",
      });
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (registerData.email && registerData.password && registerData.name) {
      setIsLoggedIn(true);
      toast({
        title: "Rekisteröinti onnistui!",
        description: "Tilisi on luotu onnistuneesti.",
      });
    }
  };

  const handleCreateInterview = () => {
    setCurrentView("create-interview");
  };

  const handleBackToDashboard = () => {
    setCurrentView("dashboard");
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 mb-4">
              <Bot className="h-8 w-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-slate-800">AI Haastattelu</h1>
            </div>
            <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
              Automatisoitu haastattelupalvelu tekoälybotin avulla. Luo haastatteluja, lähetä kutsuja ja anna botin hoitaa loput.
            </p>
            
            {/* Features */}
            <div className="grid md:grid-cols-3 gap-6 mb-12">
              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white/70 backdrop-blur">
                <CardHeader className="text-center">
                  <Phone className="h-12 w-12 text-blue-600 mx-auto mb-2" />
                  <CardTitle className="text-lg">Älykkäät Puhelut</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">Botti soittaa haastateltavalle ja hoitaa haastattelun ammattimaisesti</p>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white/70 backdrop-blur">
                <CardHeader className="text-center">
                  <FileText className="h-12 w-12 text-blue-600 mx-auto mb-2" />
                  <CardTitle className="text-lg">Helppokäyttöinen</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">Lataa kysymykset, syötä numero ja anna botin hoitaa haastattelu</p>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white/70 backdrop-blur">
                <CardHeader className="text-center">
                  <Clock className="h-12 w-12 text-blue-600 mx-auto mb-2" />
                  <CardTitle className="text-lg">Joustava Aikataulu</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">Haastateltava valitsee itse milloin haastattelu sopii</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Login/Register Form */}
          <div className="max-w-md mx-auto">
            <Card className="border-0 shadow-2xl bg-white/80 backdrop-blur">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl text-slate-800">Aloita tänään</CardTitle>
                <CardDescription>Kirjaudu sisään tai luo uusi tili</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="login">Kirjaudu</TabsTrigger>
                    <TabsTrigger value="register">Rekisteröidy</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="login">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <Label htmlFor="email">Sähköposti</Label>
                        <Input
                          id="email"
                          type="email"
                          value={loginData.email}
                          onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                          placeholder="anna@esimerkki.fi"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="password">Salasana</Label>
                        <Input
                          id="password"
                          type="password"
                          value={loginData.password}
                          onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                          placeholder="••••••••"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                        Kirjaudu sisään
                      </Button>
                    </form>
                  </TabsContent>
                  
                  <TabsContent value="register">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div>
                        <Label htmlFor="name">Nimi</Label>
                        <Input
                          id="name"
                          value={registerData.name}
                          onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                          placeholder="Anna Esimerkki"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="reg-email">Sähköposti</Label>
                        <Input
                          id="reg-email"
                          type="email"
                          value={registerData.email}
                          onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                          placeholder="anna@esimerkki.fi"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="reg-password">Salasana</Label>
                        <Input
                          id="reg-password"
                          type="password"
                          value={registerData.password}
                          onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                          placeholder="••••••••"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                        Luo tili
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Show InterviewCreator when creating interview
  if (currentView === "create-interview") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          {/* Header with back button */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <Bot className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-slate-800">AI Haastattelu</h1>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleBackToDashboard}
                className="border-slate-300 hover:bg-slate-100"
              >
                Takaisin
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsLoggedIn(false)}
                className="border-slate-300 hover:bg-slate-100"
              >
                Kirjaudu ulos
              </Button>
            </div>
          </div>

          <InterviewCreator 
            onInterviewCreated={() => {
              fetchInterviews();
              // Don't automatically switch view when editing existing interview
              if (!editingInterview) {
                setCurrentView("dashboard");
              }
            }}
            editingInterview={editingInterview}
            onClose={() => {
              setCurrentView("dashboard");
              setEditingInterview(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <Bot className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-800">AI Haastattelu</h1>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsLoggedIn(false)}
            className="border-slate-300 hover:bg-slate-100"
          >
            Kirjaudu ulos
          </Button>
        </div>

        {/* Dashboard */}
        <Tabs defaultValue="voice-chat" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="voice-chat">Äänichatti</TabsTrigger>
            <TabsTrigger value="create">Luo haastattelu</TabsTrigger>
            <TabsTrigger value="launch">Käynnistä haastattelu</TabsTrigger>
          </TabsList>
          
          <TabsContent value="voice-chat" className="mt-6">
            <VoiceChat />
          </TabsContent>
          
          <TabsContent value="create" className="mt-6">
            <InterviewCreator 
              onInterviewCreated={() => {
                fetchInterviews();
              }}
              editingInterview={editingInterview}
              onClose={() => {
                setEditingInterview(null);
              }}
            />
          </TabsContent>
          
          <TabsContent value="launch" className="mt-6">
            <InterviewLauncher 
              interviews={interviews} 
              isLoading={isLoading}
              onEditInterview={(interview) => {
                setEditingInterview(interview);
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
