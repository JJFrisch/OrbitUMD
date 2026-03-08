import { useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Plus, X, Info, Link as LinkIcon, GripVertical, Save } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useSearchParams } from "react-router";

interface Course {
  code: string;
}

interface CourseGroup {
  type: "AND" | "OR";
  items: (Course | CourseGroup)[]; // Allow nesting
}

interface Section {
  title: string;
  requirementType: "all" | "choose";
  chooseCount?: number;
  items: (Course | CourseGroup)[];
}

const ItemTypes = {
  COURSE: 'course',
  GROUP: 'group',
};

// Draggable Course Component
function DraggableCourse({
  course,
  sectionIndex,
  itemPath,
  onUpdate,
  onRemove,
}: {
  course: Course;
  sectionIndex: number;
  itemPath: number[];
  onUpdate: (code: string) => void;
  onRemove: () => void;
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.COURSE,
    item: { type: ItemTypes.COURSE, sectionIndex, itemPath, data: course },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const [{ isOver }, drop] = useDrop(() => ({
    accept: [ItemTypes.COURSE, ItemTypes.GROUP],
    hover: () => {},
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  return (
    <div
      ref={(node) => drag(drop(node))}
      className={`flex gap-2 ${isDragging ? 'opacity-50' : ''} ${isOver ? 'border-t-2 border-blue-400' : ''}`}
    >
      <div className="flex items-center text-neutral-500 cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4" />
      </div>
      <Input
        value={course.code}
        onChange={(e) => onUpdate(e.target.value)}
        placeholder="e.g., CMSC330"
        className="bg-[#1a1a1a] border-neutral-700"
      />
      <Button
        size="icon"
        variant="ghost"
        className="hover:bg-red-600/20 hover:text-red-400"
        onClick={onRemove}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

// Draggable Group Component
function DraggableGroup({
  group,
  sectionIndex,
  itemPath,
  onUpdate,
  onRemove,
  sections,
  setSections,
}: {
  group: CourseGroup;
  sectionIndex: number;
  itemPath: number[];
  onUpdate: (group: CourseGroup) => void;
  onRemove: () => void;
  sections: Section[];
  setSections: (sections: Section[]) => void;
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.GROUP,
    item: { type: ItemTypes.GROUP, sectionIndex, itemPath, data: group },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: [ItemTypes.COURSE, ItemTypes.GROUP],
    drop: (item: any, monitor) => {
      if (monitor.didDrop()) return;
      
      // Don't allow dropping an item into itself
      if (item.sectionIndex === sectionIndex && 
          JSON.stringify(item.itemPath) === JSON.stringify(itemPath)) {
        return;
      }

      // Remove item from original location
      const newSections = [...sections];
      const removedItem = removeItemAtPath(newSections, item.sectionIndex, item.itemPath);
      
      if (removedItem) {
        // Add to this group
        const targetGroup = getItemAtPath(newSections, sectionIndex, itemPath) as CourseGroup;
        if (targetGroup && targetGroup.items) {
          targetGroup.items.push(removedItem);
        }
        setSections(newSections);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  }));

  const addItemToGroup = (item: Course | CourseGroup) => {
    const updatedGroup = {
      ...group,
      items: [...group.items, item],
    };
    onUpdate(updatedGroup);
  };

  const removeItemFromGroup = (index: number) => {
    const updatedGroup = {
      ...group,
      items: group.items.filter((_, i) => i !== index),
    };
    onUpdate(updatedGroup);
  };

  const updateItemInGroup = (index: number, item: Course | CourseGroup) => {
    const updatedGroup = {
      ...group,
      items: group.items.map((existing, i) => i === index ? item : existing),
    };
    onUpdate(updatedGroup);
  };

  return (
    <div
      ref={(node) => drag(drop(node))}
      className={`p-4 bg-[#1a1a1a] rounded-lg border ${
        isOver && canDrop ? 'border-blue-400 border-2' : 'border-neutral-800'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-neutral-500 cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4" />
          </div>
          <Badge
            className={
              group.type === "AND"
                ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                : "bg-purple-600/20 text-purple-400 border border-purple-600/30"
            }
          >
            {group.type} Group
          </Badge>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="hover:bg-red-600/20 hover:text-red-400"
          onClick={onRemove}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="space-y-2 mb-2">
        {group.items.map((item, index) => (
          <div key={index}>
            {isGroup(item) ? (
              <DraggableGroup
                group={item}
                sectionIndex={sectionIndex}
                itemPath={[...itemPath, index]}
                onUpdate={(updatedGroup) => updateItemInGroup(index, updatedGroup)}
                onRemove={() => removeItemFromGroup(index)}
                sections={sections}
                setSections={setSections}
              />
            ) : (
              <DraggableCourse
                course={item}
                sectionIndex={sectionIndex}
                itemPath={[...itemPath, index]}
                onUpdate={(code) => updateItemInGroup(index, { code })}
                onRemove={() => removeItemFromGroup(index)}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => addItemToGroup({ code: "" })}
          className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Course
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => addItemToGroup({ type: "AND", items: [{ code: "" }] })}
          className="border-blue-700 text-blue-400 hover:bg-blue-600/10"
        >
          <Plus className="w-4 h-4 mr-1" />
          AND
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => addItemToGroup({ type: "OR", items: [{ code: "" }] })}
          className="border-purple-700 text-purple-400 hover:bg-purple-600/10"
        >
          <Plus className="w-4 h-4 mr-1" />
          OR
        </Button>
      </div>
    </div>
  );
}

// Drop zone for section items
function SectionDropZone({
  sectionIndex,
  sections,
  setSections,
  children,
}: {
  sectionIndex: number;
  sections: Section[];
  setSections: (sections: Section[]) => void;
  children: React.ReactNode;
}) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: [ItemTypes.COURSE, ItemTypes.GROUP],
    drop: (item: any, monitor) => {
      if (monitor.didDrop()) return;

      // Don't allow dropping in the same section (handled by reordering)
      if (item.sectionIndex === sectionIndex && item.itemPath.length === 1) {
        return;
      }

      const newSections = [...sections];
      const removedItem = removeItemAtPath(newSections, item.sectionIndex, item.itemPath);
      
      if (removedItem) {
        newSections[sectionIndex].items.push(removedItem);
        setSections(newSections);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }));

  return (
    <div ref={drop} className={`space-y-3 mb-4 min-h-[100px] ${isOver ? 'bg-blue-600/10 rounded-lg p-2' : ''}`}>
      {children}
    </div>
  );
}

// Helper functions
function isGroup(item: Course | CourseGroup): item is CourseGroup {
  return "type" in item && "items" in item;
}

function getItemAtPath(sections: Section[], sectionIndex: number, path: number[]): Course | CourseGroup | null {
  if (path.length === 0) return null;
  
  let current: any = sections[sectionIndex].items[path[0]];
  
  for (let i = 1; i < path.length; i++) {
    if (!current || !isGroup(current)) return null;
    current = current.items[path[i]];
  }
  
  return current;
}

function removeItemAtPath(sections: Section[], sectionIndex: number, path: number[]): Course | CourseGroup | null {
  if (path.length === 0) return null;
  
  if (path.length === 1) {
    // Top level item
    const removed = sections[sectionIndex].items[path[0]];
    sections[sectionIndex].items.splice(path[0], 1);
    return removed;
  }
  
  // Nested item
  let parent: any = sections[sectionIndex].items[path[0]];
  
  for (let i = 1; i < path.length - 1; i++) {
    if (!parent || !isGroup(parent)) return null;
    parent = parent.items[path[i]];
  }
  
  if (!parent || !isGroup(parent)) return null;
  
  const removed = parent.items[path[path.length - 1]];
  parent.items.splice(path[path.length - 1], 1);
  return removed;
}

export default function DegreeRequirements() {
  const [searchParams] = useSearchParams();
  const initialProgram = searchParams.get('program') || 'major';
  const [activeTab, setActiveTab] = useState(initialProgram);
  
  // Store sections for each program type
  const [programSections, setProgramSections] = useState<Record<string, Section[]>>({
    major: [
      {
        title: "Required Lower Level Courses",
        requirementType: "all",
        items: [
          { code: "CMSC131" },
          { code: "CMSC132" },
          { code: "CMSC216" },
          { code: "CMSC250" },
        ],
      },
    ],
    minor: [
      {
        title: "Physics Minor Core",
        requirementType: "all",
        items: [
          { code: "PHYS161" },
          { code: "PHYS260" },
        ],
      },
    ],
  });

  const sections = programSections[activeTab] || [];
  const setSections = (newSections: Section[]) => {
    setProgramSections({
      ...programSections,
      [activeTab]: newSections,
    });
  };

  const addSection = () => {
    setSections([
      ...sections,
      {
        title: "",
        requirementType: "all",
        items: [],
      },
    ]);
  };

  const addCourse = (sectionIndex: number) => {
    const newSections = [...sections];
    newSections[sectionIndex].items.push({ code: "" });
    setSections(newSections);
  };

  const addGroup = (sectionIndex: number, type: "AND" | "OR") => {
    const newSections = [...sections];
    newSections[sectionIndex].items.push({
      type,
      items: [{ code: "" }, { code: "" }],
    });
    setSections(newSections);
  };

  const updateItem = (sectionIndex: number, itemIndex: number, item: Course | CourseGroup) => {
    const newSections = [...sections];
    newSections[sectionIndex].items[itemIndex] = item;
    setSections(newSections);
  };

  const removeItem = (sectionIndex: number, itemIndex: number) => {
    const newSections = [...sections];
    newSections[sectionIndex].items.splice(itemIndex, 1);
    setSections(newSections);
  };

  const saveRequirements = () => {
    // Save logic here
    console.log("Saving requirements for", activeTab, programSections[activeTab]);
    alert(`Requirements saved for ${activeTab === 'major' ? 'Computer Science Major' : 'Physics Minor'}!`);
  };

  const programNames = {
    major: 'Computer Science Major',
    minor: 'Physics Minor',
  };

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl text-white mb-2">
            Degree Requirements Builder
          </h1>
          <p className="text-neutral-400">
            Customize requirements for your majors and minors
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="bg-[#252525] border border-neutral-800">
            <TabsTrigger value="major" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              Computer Science (Major)
            </TabsTrigger>
            <TabsTrigger value="minor" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              Physics (Minor)
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <Card className="p-6 bg-[#252525] border-neutral-800 mb-6">
              <div className="flex items-start gap-4">
                <LinkIcon className="w-5 h-5 text-blue-400 mt-1" />
                <div className="flex-1">
                  <h3 className="text-white mb-2">Quick Reference</h3>
                  <p className="text-neutral-400 text-sm mb-3">
                    Open your {programNames[activeTab as keyof typeof programNames]} in the UMD catalog, then recreate its sections
                    here.
                  </p>
                  <ul className="text-sm text-neutral-400 space-y-1 list-disc list-inside mb-3">
                    <li>
                      Use sections like "Required Lower Level Courses" or "Upper
                      Level Electives"
                    </li>
                    <li>
                      Mark whether all courses are required or if students must
                      choose X from a list
                    </li>
                    <li>
                      Use AND/OR groups for complex requirements like "(PHYS161 AND
                      PHYS261) OR (PHYS171 AND PHYS174)"
                    </li>
                    <li className="text-blue-400">
                      ✨ Drag items to reorder or nest groups within each other!
                    </li>
                  </ul>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    onClick={() =>
                      window.open("https://academiccatalog.umd.edu", "_blank")
                    }
                  >
                    Open UMD Catalog
                  </Button>
                </div>
              </div>
            </Card>

            <div className="space-y-6">
              {sections.map((section, sectionIndex) => (
                <Card
                  key={sectionIndex}
                  className="p-6 bg-[#252525] border-neutral-800"
                >
                  <div className="mb-6">
                    <Label>Section Title</Label>
                    <Input
                      value={section.title}
                      onChange={(e) => {
                        const newSections = [...sections];
                        newSections[sectionIndex].title = e.target.value;
                        setSections(newSections);
                      }}
                      placeholder="e.g., Required Lower Level Courses"
                      className="bg-[#1a1a1a] border-neutral-700 text-lg"
                    />
                  </div>

                  <div className="mb-6">
                    <Label className="mb-3 block">Section Type</Label>
                    <RadioGroup
                      value={section.requirementType}
                      onValueChange={(value: "all" | "choose") => {
                        const newSections = [...sections];
                        newSections[sectionIndex].requirementType = value;
                        setSections(newSections);
                      }}
                    >
                      <div className="flex items-center space-x-2 mb-2">
                        <RadioGroupItem
                          value="all"
                          id={`all-${sectionIndex}`}
                        />
                        <Label
                          htmlFor={`all-${sectionIndex}`}
                          className="cursor-pointer"
                        >
                          All courses in this section are required
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="choose"
                          id={`choose-${sectionIndex}`}
                        />
                        <Label
                          htmlFor={`choose-${sectionIndex}`}
                          className="cursor-pointer"
                        >
                          Choose X courses from this section
                        </Label>
                      </div>
                    </RadioGroup>

                    {section.requirementType === "choose" && (
                      <div className="mt-3 flex items-center gap-2">
                        <Label>Number to choose:</Label>
                        <Input
                          type="number"
                          min="1"
                          value={section.chooseCount || ""}
                          onChange={(e) => {
                            const newSections = [...sections];
                            newSections[sectionIndex].chooseCount = parseInt(
                              e.target.value
                            );
                            setSections(newSections);
                          }}
                          className="w-20 bg-[#1a1a1a] border-neutral-700"
                        />
                      </div>
                    )}
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <Label>Courses</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-neutral-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                            <p>Drag items to reorder or nest groups</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    <SectionDropZone
                      sectionIndex={sectionIndex}
                      sections={sections}
                      setSections={setSections}
                    >
                      {section.items.map((item, itemIndex) => (
                        <div key={itemIndex}>
                          {isGroup(item) ? (
                            <DraggableGroup
                              group={item}
                              sectionIndex={sectionIndex}
                              itemPath={[itemIndex]}
                              onUpdate={(updatedGroup) =>
                                updateItem(sectionIndex, itemIndex, updatedGroup)
                              }
                              onRemove={() => removeItem(sectionIndex, itemIndex)}
                              sections={sections}
                              setSections={setSections}
                            />
                          ) : (
                            <DraggableCourse
                              course={item}
                              sectionIndex={sectionIndex}
                              itemPath={[itemIndex]}
                              onUpdate={(code) =>
                                updateItem(sectionIndex, itemIndex, { code })
                              }
                              onRemove={() => removeItem(sectionIndex, itemIndex)}
                            />
                          )}
                        </div>
                      ))}
                    </SectionDropZone>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addCourse(sectionIndex)}
                      className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Course
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addGroup(sectionIndex, "AND")}
                      className="border-blue-700 text-blue-400 hover:bg-blue-600/10"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add AND Group
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addGroup(sectionIndex, "OR")}
                      className="border-purple-700 text-purple-400 hover:bg-purple-600/10"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add OR Group
                    </Button>
                  </div>

                  {sectionIndex > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSections(sections.filter((_, i) => i !== sectionIndex))
                      }
                      className="mt-4 w-full hover:bg-red-600/20 hover:text-red-400"
                    >
                      Remove Section
                    </Button>
                  )}
                </Card>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={addSection}
                className="flex-1 border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New Section
              </Button>
              <Button onClick={saveRequirements} className="flex-1 bg-red-600 hover:bg-red-700">
                <Save className="w-4 h-4 mr-2" />
                Save {activeTab === 'major' ? 'Major' : 'Minor'} Requirements
              </Button>
            </div>

            <div className="mt-6 p-4 bg-blue-600/10 border border-blue-600/30 rounded-lg">
              <p className="text-sm text-blue-400">
                💡 <strong>Tip:</strong> Create nested requirements by dragging an AND or OR group
                into another group. For example, drag two AND groups into an OR group
                to create: (PHYS161 AND PHYS261) OR (PHYS171 AND PHYS174)
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}