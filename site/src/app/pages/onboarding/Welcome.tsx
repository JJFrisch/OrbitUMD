import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Orbit } from "lucide-react";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full border-2 border-red-500" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full border-2 border-amber-500" />
        <div className="absolute top-1/2 right-1/3 w-48 h-48 rounded-full border border-red-400" />
      </div>

      <div className="max-w-2xl w-full text-center relative z-10">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Orbit className="w-16 h-16 text-red-500" />
        </div>
        
        <h1 
          className="text-6xl mb-6 tracking-tight"
          style={{ 
            textShadow: "0 0 30px rgba(239, 68, 68, 0.4)"
          }}
        >
          Welcome to OrbitUMD
        </h1>
        
        <p className="text-xl text-foreground/90 mb-4">
          Plan your four-year journey, build smarter schedules, and never lose track of a single requirement.
        </p>
        
        <p className="text-muted-foreground mb-12 max-w-xl mx-auto">
          OrbitUMD is your all‑in‑one planner for UMD. Import credits, map out majors and minors, 
          explore Gen Eds, and generate class schedules that actually fit your life.
        </p>

        <div className="flex gap-4 justify-center mb-8">
          <Button 
            size="lg"
            onClick={() => navigate("/sign-in?next=/onboarding/profile")}
            className="bg-primary hover:bg-primary/90 px-8"
          >
            Let's get started
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          You can change your plan at any time — OrbitUMD updates everything automatically.
        </p>
      </div>
    </div>
  );
}