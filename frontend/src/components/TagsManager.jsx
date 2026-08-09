import React, { useState } from 'react';
import { Plus, Trash2, Tag as TagIcon } from 'lucide-react';

export default function TagsManager({ tags, refreshTags }) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1'); // Default indigo

  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    await fetch('http://127.0.0.1:8000/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTagName.trim(), color: newTagColor })
    });
    
    setNewTagName('');
    refreshTags();
  };

  const handleDeleteTag = async (name) => {
    if (!confirm(`Delete the tag "${name}"? Transactions using this tag will keep the name but lose the color.`)) return;
    
    await fetch(`http://127.0.0.1:8000/api/tags/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
    refreshTags();
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-6 border-b border-slate-700">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <TagIcon size={20} className="text-indigo-400" /> Manage Tags
        </h2>
        <p className="text-slate-400 text-sm mt-1">Create custom colored tags to organize your spending.</p>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Create Tag Form */}
        <div className="md:col-span-1 bg-slate-900/50 p-6 rounded-xl border border-slate-700 h-fit">
          <h3 className="font-semibold mb-4 text-slate-200">Create New Tag</h3>
          <form onSubmit={handleAddTag} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Tag Name</label>
              <input 
                type="text" 
                required 
                value={newTagName} 
                onChange={(e) => setNewTagName(e.target.value)} 
                className="w-full bg-slate-800 border border-slate-600 rounded-lg p-2 text-sm text-white outline-none focus:border-indigo-500" 
                placeholder="e.g. Dining, Utilities" 
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Color</label>
              <div className="flex gap-3 items-center">
                <input 
                  type="color" 
                  value={newTagColor} 
                  onChange={(e) => setNewTagColor(e.target.value)} 
                  className="w-10 h-10 rounded cursor-pointer bg-slate-800 border-0 p-0" 
                />
                <span className="text-sm font-mono text-slate-300">{newTagColor}</span>
              </div>
            </div>

            <button type="submit" className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 py-2 rounded-lg text-sm text-white font-medium transition-colors">
              <Plus size={16} /> Add Tag
            </button>
          </form>
        </div>

        {/* Existing Tags List */}
        <div className="md:col-span-2">
          <h3 className="font-semibold mb-4 text-slate-200">Your Tags</h3>
          <div className="flex flex-wrap gap-3">
            {tags.length === 0 ? (
              <p className="text-slate-500 text-sm">No tags created yet.</p>
            ) : (
              tags.map(tag => (
                <div 
                  key={tag.name} 
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm"
                  style={{ backgroundColor: tag.color }}
                >
                  <span className="text-sm text-white font-medium drop-shadow-md">{tag.name}</span>
                  <button 
                    onClick={() => handleDeleteTag(tag.name)}
                    className="ml-1 text-white hover:text-slate-200 transition-colors drop-shadow-md"
                    title="Delete Tag"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}