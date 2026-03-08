import { useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Plus, X, Orbit, Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";

interface Credit {
  source: string;
  examName: string;
  umdEquivalent: string;
  credits: string;
  term: string;
}

export default function CreditImport() {
  const navigate = useNavigate();
  const [credits, setCredits] = useState<Credit[]>([
    { source: "AP", examName: "AP Calculus BC", umdEquivalent: "MATH140", credits: "4", term: "Fall 2025" }
  ]);

  const addCredit = () => {
    setCredits([...credits, { source: "AP", examName: "", umdEquivalent: "", credits: "", term: "" }]);
  };

  const removeCredit = (index: number) => {
    setCredits(credits.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen p-8 flex items-center justify-center">
      <div className="w-full max-w-4xl">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Orbit className="w-8 h-8 text-red-500" />
          <span className="text-2xl text-white">OrbitUMD</span>
        </div>

        <Card className="p-8 bg-[#252525] border-neutral-800">
          <div className="mb-6">
            <h2 className="text-3xl text-white mb-2">Let's start with what you've already earned</h2>
            <p className="text-neutral-400">
              Tell us about AP, transfer, exemption, and other credits so we don't double-count anything.
            </p>
          </div>

          <div className="space-y-6">
            {credits.map((credit, index) => (
              <div key={index} className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-white">Credit {index + 1}</h3>
                  {credits.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeCredit(index)}
                      className="hover:bg-red-600/20 hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Source Type</Label>
                    <Select value={credit.source} onValueChange={(value) => {
                      const newCredits = [...credits];
                      newCredits[index].source = value;
                      setCredits(newCredits);
                    }}>
                      <SelectTrigger className="bg-[#252525] border-neutral-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AP">AP Exam</SelectItem>
                        <SelectItem value="IB">IB Exam</SelectItem>
                        <SelectItem value="Transfer">Transfer from another university</SelectItem>
                        <SelectItem value="Exemption">Exemption exam</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Original Course/Exam Name</Label>
                    <Input
                      placeholder="e.g., AP Calculus BC"
                      value={credit.examName}
                      onChange={(e) => {
                        const newCredits = [...credits];
                        newCredits[index].examName = e.target.value;
                        setCredits(newCredits);
                      }}
                      className="bg-[#252525] border-neutral-700"
                    />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Label>UMD Equivalent Course</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3 h-3 text-neutral-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                            <p>The UMD course this credit replaces</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      placeholder="e.g., MATH140"
                      value={credit.umdEquivalent}
                      onChange={(e) => {
                        const newCredits = [...credits];
                        newCredits[index].umdEquivalent = e.target.value;
                        setCredits(newCredits);
                      }}
                      className="bg-[#252525] border-neutral-700"
                    />
                  </div>

                  <div>
                    <Label>Credits</Label>
                    <Input
                      type="number"
                      placeholder="4"
                      value={credit.credits}
                      onChange={(e) => {
                        const newCredits = [...credits];
                        newCredits[index].credits = e.target.value;
                        setCredits(newCredits);
                      }}
                      className="bg-[#252525] border-neutral-700"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label>Term Awarded (Optional)</Label>
                    <Input
                      placeholder="e.g., Fall 2025"
                      value={credit.term}
                      onChange={(e) => {
                        const newCredits = [...credits];
                        newCredits[index].term = e.target.value;
                        setCredits(newCredits);
                      }}
                      className="bg-[#252525] border-neutral-700"
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={addCredit}
              className="w-full border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Another Credit
            </Button>
          </div>

          <div className="mt-6 p-4 bg-blue-600/10 border border-blue-600/30 rounded-lg">
            <p className="text-sm text-blue-400">
              💡 You can edit these later from your Profile → Credits section
            </p>
          </div>

          <div className="flex gap-3 mt-8">
            <Button
              variant="outline"
              onClick={() => navigate("/onboarding/goals")}
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            >
              Back
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={() => navigate("/gen-eds")}
            >
              Next: Gen Eds
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
