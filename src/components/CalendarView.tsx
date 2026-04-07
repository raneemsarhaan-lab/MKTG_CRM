import React from 'react';
import { useStore } from '../store/useStore';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isAfter,
  parseISO
} from 'date-fns';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export const CalendarView: React.FC = () => {
  const { tasks } = useStore();
  const [currentMonth, setCurrentMonth] = React.useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto">
        {calendarDays.map((day, i) => {
          const dayTasks = tasks.filter(t => isSameDay(parseISO(t.due_date), day));
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isToday = isSameDay(day, new Date());

          return (
            <div 
              key={i} 
              className={cn(
                "min-h-[100px] p-2 border-r border-b border-gray-100 transition-colors hover:bg-gray-50/50",
                !isCurrentMonth && "bg-gray-50/30 text-gray-400"
              )}
            >
              <div className="flex justify-between items-start mb-1">
                <span className={cn(
                  "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                  isToday ? "bg-indigo-600 text-white" : "text-gray-700"
                )}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-1">
                {dayTasks.map(task => {
                  const isAtRisk = task.publishing_date && isAfter(parseISO(task.due_date), parseISO(task.publishing_date));
                  return (
                    <div 
                      key={task.id}
                      className={cn(
                        "px-2 py-1 rounded text-[10px] font-medium truncate border",
                        task.status === 'Done' 
                          ? "bg-green-50 text-green-700 border-green-100" 
                          : isAtRisk 
                            ? "bg-red-50 text-red-700 border-red-100"
                            : "bg-indigo-50 text-indigo-700 border-indigo-100"
                      )}
                      title={`${task.name} (${task.status})`}
                    >
                      <div className="flex items-center gap-1">
                        {isAtRisk && <AlertCircle className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{task.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
