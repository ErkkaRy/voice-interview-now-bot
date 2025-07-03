
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Bot, FileText, Clock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [registerData, setRegisterData] = useState({ email: "", password: "", name: "" });
  const { toast } = useToast();

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
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Quick Actions */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Pikaiset toiminnot
                </CardTitle>
                <CardDescription>Aloita uusi haastattelu nopeasti</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Button className="h-20 bg-blue-600 hover:bg-blue-700 flex-col gap-2">
                    <FileText className="h-6 w-6" />
                    Luo uusi haastattelu
                  </Button>
                  <Button variant="outline" className="h-20 flex-col gap-2 border-slate-300 hover:bg-slate-50">
                    <Phone className="h-6 w-6" />
                    Käynnistä haastattelu
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Recent Interviews */}
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
              <CardHeader>
                <CardTitle>Viimeisimmät haastattelut</CardTitle>
                <CardDescription>Seuraa haastattelujesi tilannetta</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Placeholder interviews */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <h4 className="font-semibold text-slate-800">Ohjelmistokehittäjä - Haastattelu</h4>
                      <p className="text-sm text-slate-600">Luotu: 2 tuntia sitten</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                        Valmis
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <h4 className="font-semibold text-slate-800">Myyntiedustaja - Haastattelu</h4>
                      <p className="text-sm text-slate-600">Luotu: 1 päivä sitten</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                        Käynnissä
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stats Sidebar */}
          <div className="space-y-6">
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg">Tilastot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">12</div>
                  <div className="text-sm text-slate-600">Haastattelua yhteensä</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">8</div>
                  <div className="text-sm text-slate-600">Onnistuneita</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">3</div>
                  <div className="text-sm text-slate-600">Keskeneräisiä</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg">Tuki</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 mb-4">
                  Tarvitsetko apua palvelun käytössä?
                </p>
                <Button variant="outline" className="w-full border-slate-300 hover:bg-slate-50">
                  Ota yhteyttä
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
