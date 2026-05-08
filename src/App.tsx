import { useState, useEffect } from 'react';
import { X, Copy, Check, Search, Hash, Trash2, Plus, Save, ChevronRight, ChevronLeft, Clock, GripVertical, Zap, ZapOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DndContext, 
  rectIntersection, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent 
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  rectSortingStrategy, 
  useSortable 
} from '@dnd-kit/sortable';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { TAG_CATEGORIES, type TagItem } from './tags';

// Наш новый тип: у каждого тега есть уникальный номер (ID)
interface SelectedTag {
  id: string;
  text: string;
}

const TagCapsule = ({ displayName, variant, isDragging, onRemove, onWeight, onMouseEnter, onMouseLeave, listeners, attributes, style }: any) => {
  const isPos = variant === 'positive';
  return (
    <div
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`
        inline-flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-3xl transition-all duration-200
        ${isPos 
          ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-50 shadow-[0_4px_12px_rgba(6,182,212,0.2)]' 
          : 'bg-red-500/20 border-red-400/40 text-red-50 shadow-[0_4px_12px_rgba(239,68,68,0.2)]'}
        ${isDragging ? 'opacity-20 scale-95' : 'opacity-100 hover:border-white/50'}
      `}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing opacity-30 hover:opacity-100 px-1">
        <GripVertical size={14} />
      </div>
      <span onClick={onWeight} className="text-[11px] font-black uppercase tracking-wider cursor-pointer select-none">
        {displayName}
      </span>
      <button onClick={onRemove} className="opacity-30 hover:opacity-100 hover:text-white transition-all ml-1">
        <X size={14} />
      </button>
    </div>
  );
};

function SortableTag(props: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style}>
      <TagCapsule {...props} listeners={listeners} attributes={attributes} isDragging={isDragging} />
    </div>
  );
}

export default function App() {
  const [selectedTags, setSelectedTags] = useState<SelectedTag[]>([]);
  const [selectedNegativeTags, setSelectedNegativeTags] = useState<SelectedTag[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hintsEnabled, setHintsEnabled] = useState(true);
  const [isNegativeTarget, setIsNegativeTarget] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [customTag, setCustomTag] = useState("");
  const [presets, setPresets] = useState<any[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedStates, setCopiedStates] = useState({ all: false, pos: false, neg: false });
  const [activeTooltip, setActiveTooltip] = useState<any | null>(null);

  const [collapsedCategories, setCollapsedCategories] = useState<string[]>(() => {
    return TAG_CATEGORIES.slice(1).map(c => c.title);
  });

  const toggleCategory = (title: string) => {
    setCollapsedCategories(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title) 
        : [...prev, title]
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const saved = localStorage.getItem('vibetags_presets');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrated = parsed.map((p: any) => ({
          ...p,
          positive: p.positive.map((t: any) => typeof t === 'string' ? { id: Math.random().toString(36).substring(2, 9), text: t } : t),
          negative: p.negative.map((t: any) => typeof t === 'string' ? { id: Math.random().toString(36).substring(2, 9), text: t } : t)
        }));
        setPresets(migrated);
      } catch (e) {
        console.error("Failed to parse presets");
      }
    }
    const hist = localStorage.getItem('vibetags_history');
    if (hist) setHistory(JSON.parse(hist));
    const hint = localStorage.getItem('vibetags_hints');
    if (hint !== null) setHintsEnabled(JSON.parse(hint));
  }, []);

  const deletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    localStorage.setItem('vibetags_presets', JSON.stringify(updated));
  };

  const savePreset = () => {
    if (!presetName.trim()) return;
    const newPreset = { id: Date.now().toString(), name: presetName, positive: [...selectedTags], negative: [...selectedNegativeTags] };
    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem('vibetags_presets', JSON.stringify(updated));
    setPresetName("");
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('vibetags_history');
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setActiveTooltip(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;
    const activeContainer = activeIdStr.startsWith('pos-') ? 'pos' : 'neg';
    const overContainer = overIdStr.startsWith('pos-') || overIdStr === 'pos-container' ? 'pos' : 'neg';
    const activeTagId = activeIdStr.replace(/^(pos-|neg-)/, '');
    const overTagId = overIdStr.replace(/^(pos-|neg-)/, '');

    if (activeContainer === overContainer) {
      const setList = activeContainer === 'pos' ? setSelectedTags : setSelectedNegativeTags;
      const items = activeContainer === 'pos' ? selectedTags : selectedNegativeTags;
      const oldIndex = items.findIndex(t => t.id === activeTagId);
      const newIndex = items.findIndex(t => t.id === overTagId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setList((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    } else {
      const sourceList = activeContainer === 'pos' ? selectedTags : selectedNegativeTags;
      const tagObj = sourceList.find(t => t.id === activeTagId);
      if (!tagObj) return;

      if (activeContainer === 'pos') {
        setSelectedTags(prev => prev.filter(t => t.id !== activeTagId));
        setSelectedNegativeTags(prev => [...prev, tagObj]);
      } else {
        setSelectedNegativeTags(prev => prev.filter(t => t.id !== activeTagId));
        setSelectedTags(prev => [...prev, tagObj]);
      }
    }
  };

  // --- ВОТ ОНА, БРОНЕБОЙНАЯ ФУНКЦИЯ ДОБАВЛЕНИЯ ---
  const addTag = (tagText: string) => {
    const clean = tagText.trim();
    if (!clean) return;
    
    // Генерируем супер-уникальный ID на каждое нажатие
    const newId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    const newTag = { id: newId, text: clean };
    
    if (isNegativeTarget) {
      setSelectedNegativeTags(prev => [...prev, newTag]);
    } else {
      setSelectedTags(prev => [...prev, newTag]);
    }
  };

  const handleWeight = (id: string, isNegative: boolean) => {
    const setList = isNegative ? setSelectedNegativeTags : setSelectedTags;
    setList(prev => prev.map((item) => {
      if (item.id === id) {
        const match = item.text.match(/^\((.*):(\d\.\d)\)$/);
        if (!match) return { ...item, text: `(${item.text}:1.1)` };
        const name = match[1];
        const w = parseFloat(match[2]);
        return { ...item, text: w >= 1.5 ? name : `(${name}:${(w + 0.1).toFixed(1)})` };
      }
      return item;
    }));
  };

  const findTagInfo = (tagName: string): TagItem => {
    const cleanName = tagName.replace(/^\((.*):(\d\.\d)\)$/, '$1');
    for (const category of TAG_CATEGORIES) {
      const found = category.tags.find(tag => tag.name === cleanName);
      if (found) return found;
    }
    return { name: cleanName, translation: "Custom DNA" };
  };

  const copy = (text: string, key: keyof typeof copiedStates) => {
    navigator.clipboard.writeText(text);
    const item = { id: Date.now().toString(), text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    const updatedHistory = [item, ...history].slice(0, 15);
    setHistory(updatedHistory);
    localStorage.setItem('vibetags_history', JSON.stringify(updatedHistory));
    setCopiedStates(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setCopiedStates(prev => ({ ...prev, [key]: false })), 2000);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragEnd={handleDragEnd} modifiers={[snapCenterToCursor]}>
      <div className="min-h-screen w-full flex items-center justify-center p-2 md:p-8 bg-[#020617] relative overflow-hidden font-sans">
        
        <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
          <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] bg-blue-600/20 rounded-full blur-[160px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-fuchsia-600/10 rounded-full blur-[160px]" />
        </div>

        <div className="w-full max-w-[1600px] h-full md:h-[90vh] bg-white/[0.01] backdrop-blur-[60px] rounded-[3.5rem] border border-white/10 flex flex-col md:flex-row overflow-hidden shadow-2xl relative z-10">
          
          <AnimatePresence>
            {showPresets && (
              <motion.div initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} className="absolute top-0 left-0 h-full w-80 bg-slate-950/98 z-[100] border-r border-white/10 p-8 shadow-2xl">
                <div className="flex items-center gap-4 mb-10">
                  <button onClick={() => setShowPresets(false)} className="p-3 bg-white/5 rounded-2xl border border-white/10 text-white"><ChevronLeft size={20} /></button>
                  <h3 className="text-white font-black text-[10px] uppercase tracking-[0.4em]">Presets</h3>
                </div>
                <div className="space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
                  {presets.map(p => (
                    <div key={p.id} onClick={() => { setSelectedTags(p.positive); setSelectedNegativeTags(p.negative); }} className="group relative bg-white/[0.03] border border-white/5 rounded-2xl p-4 hover:bg-white/[0.08] cursor-pointer">
                      <p className="text-white/70 text-[10px] font-black uppercase truncate">{p.name}</p>
                      <button onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-red-500/50 hover:text-red-500 transition-all"><Trash2 size={14}/></button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showHistory && (
              <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} className="absolute top-0 right-0 h-full w-96 bg-slate-950/98 z-[100] border-l border-white/10 p-8 shadow-2xl">
                <div className="flex items-center justify-between mb-10">
                  <h3 className="text-white font-black text-[10px] uppercase tracking-[0.4em]">Logs</h3>
                  <div className="flex gap-2">
                    {history.length > 0 && (
                      <button onClick={clearHistory} className="p-3 bg-red-500/10 rounded-2xl border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-lg" title="Clear All Logs"><Trash2 size={20}/></button>
                    )}
                    <button onClick={() => setShowHistory(false)} className="p-3 bg-white/5 rounded-2xl border border-white/10 text-white hover:bg-white/10 transition-all"><X size={20} /></button>
                  </div>
                </div>
                <div className="space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
                  {history.map(h => (
                    <div key={h.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.06] relative group transition-all">
                      <p className="text-[8px] text-cyan-400 font-black mb-2 uppercase">{h.timestamp}</p>
                      <p className="text-white/60 text-[10px] line-clamp-3 font-mono leading-relaxed">{h.text}</p>
                      <button onClick={() => copy(h.text, 'all')} className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Copy size={12}/></button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 p-6 md:p-12 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shrink-0">
              <div className="flex items-center gap-5">
                {!showPresets && (
                  <button onClick={() => setShowPresets(true)} className="p-4 bg-white/[0.05] rounded-2xl border border-white/10 text-white shadow-xl hover:bg-white/[0.1] transition-all"><ChevronRight size={20} /></button>
                )}
                <h1 className="text-white font-black text-4xl italic tracking-tighter flex items-center gap-4">
                  <Hash className="text-cyan-400" /> VIBE-TAGS
                </h1>
                <button 
                  onClick={() => {
                    const newVal = !hintsEnabled;
                    setHintsEnabled(newVal);
                    localStorage.setItem('vibetags_hints', JSON.stringify(newVal));
                  }}
                  className={`ml-6 flex items-center gap-3 px-4 py-2.5 rounded-2xl border transition-all duration-300 ${hintsEnabled ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_20px_rgba(34,211,238,0.3)]' : 'bg-white/5 border-white/10 text-white/30 hover:text-white/60'}`}
                >
                  {hintsEnabled ? <Zap size={16} fill="currentColor"/> : <ZapOff size={16}/>}
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">{hintsEnabled ? 'Hints On' : 'Hints Off'}</span>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowHistory(true)} className="p-4 rounded-2xl bg-white/[0.05] border border-white/10 text-white/40 hover:text-white transition-all shadow-lg"><Clock size={20}/></button>
                <button onClick={() => copy(selectedTags.map(t => t.text).join(', ') + '\n\nNegative: ' + selectedNegativeTags.map(t => t.text).join(', '), 'all')} className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-cyan-500 text-black font-black uppercase text-[10px] tracking-[0.2em] hover:bg-white transition-all shadow-xl">
                  {copiedStates.all ? <Check size={18}/> : <Copy size={18}/>} {copiedStates.all ? 'Copied' : 'Copy All'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
              <div className="flex gap-4 p-3 bg-black/40 rounded-[2.5rem] border border-white/5 shadow-inner">
                <input type="text" placeholder="Preset name..." value={presetName} onChange={e => setPresetName(e.target.value)} className="flex-1 bg-transparent px-6 py-2 text-white text-xs focus:outline-none font-bold uppercase tracking-widest placeholder:text-white/10" />
                <button onClick={savePreset} className="flex items-center gap-2 px-8 py-3 bg-white/5 rounded-full text-white text-[9px] font-black uppercase border border-white/10 hover:bg-white hover:text-black transition-all shadow-xl"><Save size={14}/> Save</button>
              </div>
              <div className="relative">
                <input type="text" placeholder={isNegativeTarget ? "Inject negative DNA..." : "Inject positive DNA..."} value={customTag} onChange={e => setCustomTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && (addTag(customTag), setCustomTag(""))} className={`w-full bg-white/[0.02] border rounded-full py-5 pl-16 pr-8 text-white text-sm focus:outline-none transition-all shadow-inner ${isNegativeTarget ? 'focus:border-red-500/40 border-red-500/10' : 'focus:border-cyan-400/40 border-white/5'}`} />
                <Plus className={`absolute left-6 top-1/2 -translate-y-1/2 transition-colors duration-500 ${isNegativeTarget ? 'text-red-400' : 'text-cyan-400'}`} size={24}/>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 flex-1 min-h-0">
              <div onClick={() => setIsNegativeTarget(false)} id="pos-container" className={`flex flex-col p-8 rounded-[3.5rem] border transition-all duration-500 overflow-hidden ${!isNegativeTarget ? 'bg-white/[0.04] border-cyan-400/40 shadow-2xl' : 'bg-black/40 border-white/5 opacity-40'}`}>
                <div className="flex items-center justify-between mb-8 shrink-0">
                  <h2 className={`text-[10px] font-black uppercase tracking-[0.5em] transition-colors ${!isNegativeTarget ? 'text-cyan-400' : 'text-white/20'}`}>Positive DNA</h2>
                  <div className="flex gap-4">
                    <button onClick={(e) => { e.stopPropagation(); setSelectedTags([]); }} className="text-white/10 hover:text-red-500 transition-colors"><Trash2 size={20}/></button>
                    <button onClick={(e) => { e.stopPropagation(); copy(selectedTags.map(t => t.text).join(', '), 'pos'); }} className="flex items-center gap-2 px-6 py-2 rounded-full bg-white/5 text-white text-[9px] font-black tracking-widest border border-white/10 hover:bg-white hover:text-black shadow-sm">
                      {copiedStates.pos ? <Check size={14}/> : <Copy size={14}/>} {copiedStates.pos ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                  <SortableContext items={selectedTags.map(t => `pos-${t.id}`)} strategy={rectSortingStrategy}>
                    <div className="flex flex-wrap gap-4 content-start pb-4">
                      {selectedTags.map((tag) => (
                        <SortableTag key={`pos-${tag.id}`} id={`pos-${tag.id}`} displayName={tag.text} variant="positive" onRemove={() => setSelectedTags(prev => prev.filter(t => t.id !== tag.id))} onWeight={() => handleWeight(tag.id, false)} onMouseEnter={(e: any) => hintsEnabled && setActiveTooltip({ tag: findTagInfo(tag.text), x: e.clientX, y: e.clientY })} onMouseLeave={() => setActiveTooltip(null)} />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              </div>

              <div onClick={() => setIsNegativeTarget(true)} id="neg-container" className={`flex flex-col p-8 rounded-[3.5rem] border transition-all duration-500 overflow-hidden ${isNegativeTarget ? 'bg-white/[0.04] border-red-500/40 shadow-2xl' : 'bg-black/40 border-white/5 opacity-40'}`}>
                <div className="flex items-center justify-between mb-8 shrink-0">
                  <h2 className={`text-[10px] font-black uppercase tracking-[0.5em] transition-colors ${isNegativeTarget ? 'text-red-400' : 'text-white/20'}`}>Negative DNA</h2>
                  <div className="flex gap-4">
                    <button onClick={(e) => { e.stopPropagation(); setSelectedNegativeTags([]); }} className="text-white/10 hover:text-red-500 transition-colors"><Trash2 size={20}/></button>
                    <button onClick={(e) => { e.stopPropagation(); copy(selectedNegativeTags.map(t => t.text).join(', '), 'neg'); }} className="flex items-center gap-2 px-6 py-2 rounded-full bg-white/5 text-white text-[9px] font-black tracking-widest border border-white/10 hover:bg-white hover:text-black shadow-sm">
                      {copiedStates.neg ? <Check size={14}/> : <Copy size={14}/>} {copiedStates.neg ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                  <SortableContext items={selectedNegativeTags.map(t => `neg-${t.id}`)} strategy={rectSortingStrategy}>
                    <div className="flex flex-wrap gap-4 content-start pb-4">
                      {selectedNegativeTags.map((tag) => (
                        <SortableTag key={`neg-${tag.id}`} id={`neg-${tag.id}`} displayName={tag.text} variant="negative" onRemove={() => setSelectedNegativeTags(prev => prev.filter(t => t.id !== tag.id))} onWeight={() => handleWeight(tag.id, true)} onMouseEnter={(e: any) => hintsEnabled && setActiveTooltip({ tag: findTagInfo(tag.text), x: e.clientX, y: e.clientY })} onMouseLeave={() => setActiveTooltip(null)} />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full md:w-[500px] bg-black/40 backdrop-blur-[80px] border-l border-white/10 flex flex-col p-10 gap-10">
            <div className="relative shrink-0">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/10" size={24} />
              <input type="text" placeholder="Search DNA Library..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-white/[0.02] border border-white/5 rounded-full py-5 pl-16 text-white text-sm focus:outline-none focus:border-white/20 transition-all font-bold tracking-widest shadow-inner" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-12 custom-scrollbar pr-4">
              <h2 className="text-white/20 text-[10px] font-black uppercase tracking-[0.5em] mb-4">DNA Library</h2>
              
              {TAG_CATEGORIES.map(category => {
                const query = searchTerm.toLowerCase();
                const isCategoryMatch = category.title.toLowerCase().includes(query);
                
                const filtered = isCategoryMatch 
                  ? category.tags 
                  : category.tags.filter(tag => 
                      tag.name.toLowerCase().includes(query) || 
                      tag.translation.toLowerCase().includes(query)
                    );

                if (!filtered.length) return null;
                
                const isCollapsed = collapsedCategories.includes(category.title);

                return (
                  <div key={category.title} className="space-y-4 relative">
                    <div 
                      className="flex items-center gap-4 sticky top-0 z-10 py-2 cursor-pointer group"
                      onClick={() => toggleCategory(category.title)}
                    >
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10 group-hover:to-cyan-500/50 transition-all" />
                      <span className={`text-[10px] font-black uppercase tracking-[0.5em] text-white px-5 py-2 rounded-full border bg-gradient-to-br ${category.color} backdrop-blur-xl shadow-lg transition-all flex items-center gap-3`}>
                        {category.title}
                        <span className="text-[12px] opacity-60">
                          {isCollapsed ? '▼' : '▲'}
                        </span>
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10 group-hover:from-cyan-500/50 transition-all" />
                    </div>

                    {!isCollapsed && (
                      <div className="flex flex-wrap gap-3 px-2">
                        {filtered.map(tagObj => {
                          const borderClass = category.color.split(' ').find((c: any) => c.startsWith('border-')) || 'border-white/5';
                          
                          // Я УБРАЛ отсюда любые проверки на то, выбран тег или нет. 
                          // Кнопка всегда активна, всегда нажимается, добавляет тег сколько угодно раз!
                          const buttonStateClass = `bg-white/[0.04] text-white/60 hover:bg-white hover:text-black ${borderClass} shadow-sm active:scale-95`;

                          return (
                            <button 
                              key={tagObj.name} 
                              onClick={() => addTag(tagObj.name)} 
                              onMouseEnter={e => hintsEnabled && setActiveTooltip({ tag: tagObj, x: e.clientX, y: e.clientY })} 
                              onMouseLeave={() => setActiveTooltip(null)} 
                              className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${buttonStateClass}`}
                            >
                              {tagObj.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          </div>
        </div>

        <DragOverlay adjustScale={false} zIndex={1000}>
          {activeId ? (() => {
            const isPos = activeId.startsWith('pos-');
            const activeTagId = activeId.replace(/^(pos-|neg-)/, '');
            const sourceList = isPos ? selectedTags : selectedNegativeTags;
            const tagObj = sourceList.find(t => t.id === activeTagId);
            return tagObj ? <TagCapsule displayName={tagObj.text} variant={isPos ? 'positive' : 'negative'} /> : null;
          })() : null}
        </DragOverlay>

        <AnimatePresence>
          {activeTooltip && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed pointer-events-none z-[9999] bg-white/10 backdrop-blur-[40px] rounded-full border border-white/20 shadow-2xl px-6 py-3" style={{ left: activeTooltip.x, top: activeTooltip.y, transform: 'translate(-50%, calc(-100% - 30px))' }}>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-1">{activeTooltip.tag.name}</p>
              <p className="text-white text-[10px] font-bold uppercase tracking-widest">{activeTooltip.tag.translation}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DndContext>
  );
}