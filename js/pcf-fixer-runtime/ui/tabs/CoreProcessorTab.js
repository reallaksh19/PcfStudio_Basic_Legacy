import React, { useState } from 'react';
import { useAppContext } from '/js/pcf-fixer-runtime/store/AppContext.js';
import { jsx as _jsx, jsxs as _jsxs } from "/js/pcf-fixer-runtime/jsx-runtime.js";
export function CoreProcessorTab() {
  const {
    state
  } = useAppContext();
  const {
    log,
    smartFix
  } = state;
  const [stageFilter, setStageFilter] = useState('ALL');
  const STAGES = ['ALL', 'IMPORT', 'TRANSLATION', 'VALIDATION', 'FIXING', 'EXPORT', 'UNKNOWN'];
  const filteredLogs = stageFilter === 'ALL' ? log : log.filter(entry => (entry.stage || 'UNKNOWN') === stageFilter);
  const getStageColor = stage => {
    switch (stage) {
      case 'IMPORT':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'TRANSLATION':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'VALIDATION':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'FIXING':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'EXPORT':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };
  return _jsxs("div", {
    className: "flex flex-col h-[calc(100vh-12rem)] overflow-hidden",
    children: [_jsxs("div", {
      className: "mb-4 flex items-center gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm shrink-0",
      children: [_jsx("label", {
        className: "text-sm font-semibold text-slate-700",
        children: "Filter by Stage:"
      }), _jsx("select", {
        value: stageFilter,
        onChange: e => setStageFilter(e.target.value),
        className: "bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2",
        children: STAGES.map(stage => _jsx("option", {
          value: stage,
          children: stage === 'ALL' ? 'All Stages' : stage
        }, stage))
      })]
    }), smartFix.chainSummary && _jsxs("div", {
      className: "bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 shadow-sm shrink-0",
      children: [_jsx("h4", {
        className: "font-semibold text-slate-800 mb-4 border-b pb-2",
        children: "Smart Fix Summary"
      }), _jsxs("div", {
        className: "grid grid-cols-2 md:grid-cols-4 gap-4 text-sm",
        children: [_jsxs("div", {
          className: "space-y-2",
          children: [_jsxs("div", {
            className: "flex justify-between",
            children: [_jsx("span", {
              className: "text-slate-500",
              children: "Chains found"
            }), _jsx("span", {
              className: "font-mono font-medium",
              children: smartFix.chainSummary.chainCount
            })]
          }), _jsxs("div", {
            className: "flex justify-between",
            children: [_jsx("span", {
              className: "text-slate-500",
              children: "Elements walked"
            }), _jsx("span", {
              className: "font-mono font-medium",
              children: smartFix.chainSummary.elementsWalked
            })]
          }), _jsxs("div", {
            className: "flex justify-between",
            children: [_jsx("span", {
              className: "text-slate-500",
              children: "Orphan elements"
            }), _jsx("span", {
              className: "font-mono font-medium text-red-600",
              children: smartFix.chainSummary.orphanCount
            })]
          })]
        }), _jsxs("div", {
          className: "space-y-2",
          children: [_jsxs("div", {
            className: "flex justify-between border-l pl-4 border-slate-200",
            children: [_jsx("span", {
              className: "text-slate-500",
              children: "Tier 1 (auto-silent)"
            }), _jsx("span", {
              className: "font-mono font-medium text-green-600",
              children: smartFix.chainSummary.tier1
            })]
          }), _jsxs("div", {
            className: "flex justify-between border-l pl-4 border-slate-200",
            children: [_jsx("span", {
              className: "text-slate-500",
              children: "Tier 2 (auto-logged)"
            }), _jsx("span", {
              className: "font-mono font-medium text-amber-600",
              children: smartFix.chainSummary.tier2
            })]
          }), _jsxs("div", {
            className: "flex justify-between border-l pl-4 border-slate-200",
            children: [_jsx("span", {
              className: "text-slate-500",
              children: "Tier 3 (warnings)"
            }), _jsx("span", {
              className: "font-mono font-medium text-orange-600",
              children: smartFix.chainSummary.tier3
            })]
          }), _jsxs("div", {
            className: "flex justify-between border-l pl-4 border-slate-200",
            children: [_jsx("span", {
              className: "text-slate-500",
              children: "Tier 4 (errors)"
            }), _jsx("span", {
              className: "font-mono font-medium text-red-600",
              children: smartFix.chainSummary.tier4
            })]
          })]
        }), _jsx("div", {
          className: "col-span-2 space-y-2",
          children: _jsxs("div", {
            className: "flex items-center p-3 bg-white rounded border border-slate-200 shadow-sm justify-between",
            children: [_jsx("span", {
              className: "font-semibold text-slate-700",
              children: "Rows with proposed fixes"
            }), _jsx("span", {
              className: "text-xl font-bold text-blue-600",
              children: smartFix.chainSummary.rowsWithActions
            })]
          })
        })]
      })]
    }), _jsx("div", {
      className: "flex-1 overflow-auto bg-white border border-slate-200 rounded-lg shadow-sm font-mono text-sm leading-relaxed p-4",
      children: log.length === 0 ? _jsx("div", {
        className: "text-slate-400 italic",
        children: "No logs available. Run Smart Fix to generate logs."
      }) : _jsxs("table", {
        className: "w-full text-left border-collapse",
        children: [_jsx("thead", {
          className: "bg-slate-50 sticky top-0 border-b border-slate-200 z-10 text-xs text-slate-500 uppercase",
          children: _jsxs("tr", {
            children: [_jsx("th", {
              className: "px-3 py-2",
              children: "Timestamp"
            }), _jsx("th", {
              className: "px-3 py-2",
              children: "Stage"
            }), _jsx("th", {
              className: "px-3 py-2",
              children: "Type"
            }), _jsx("th", {
              className: "px-3 py-2",
              children: "Rule"
            }), _jsx("th", {
              className: "px-3 py-2",
              children: "Row"
            }), _jsx("th", {
              className: "px-3 py-2",
              children: "Message"
            })]
          })
        }), _jsx("tbody", {
          className: "divide-y divide-slate-100",
          children: filteredLogs.map((entry, index) => {
            const timeString = entry.timestamp ? entry.timestamp.substring(11, 23) : new Date().toISOString().substring(11, 23);
            const stage = entry.stage || 'UNKNOWN';
            return _jsxs("tr", {
              className: `hover:bg-slate-50 ${entry.type === 'Error' ? 'bg-red-50/20' : entry.type === 'Warning' ? 'bg-orange-50/20' : ''}`,
              children: [_jsx("td", {
                className: "px-3 py-2 text-slate-400 text-xs whitespace-nowrap",
                children: timeString
              }), _jsx("td", {
                className: "px-3 py-2",
                children: _jsx("span", {
                  className: `text-[10px] px-2 py-0.5 rounded border font-semibold ${getStageColor(stage)}`,
                  children: stage
                })
              }), _jsx("td", {
                className: `px-3 py-2 font-medium ${entry.type === 'Error' ? 'text-red-600' : entry.type === 'Warning' ? 'text-orange-600' : entry.type === 'Fix' ? 'text-amber-600' : entry.type === 'Applied' ? 'text-green-600' : 'text-blue-600'}`,
                children: entry.type
              }), _jsx("td", {
                className: "px-3 py-2 text-slate-500",
                children: entry.ruleId || '-'
              }), _jsx("td", {
                className: "px-3 py-2 text-slate-500",
                children: entry.row || '-'
              }), _jsx("td", {
                className: "px-3 py-2 text-slate-800 break-words",
                children: entry.message
              })]
            }, index);
          })
        })]
      })
    })]
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsInVzZVN0YXRlIiwidXNlQXBwQ29udGV4dCIsImpzeCIsIl9qc3giLCJqc3hzIiwiX2pzeHMiLCJDb3JlUHJvY2Vzc29yVGFiIiwic3RhdGUiLCJsb2ciLCJzbWFydEZpeCIsInN0YWdlRmlsdGVyIiwic2V0U3RhZ2VGaWx0ZXIiLCJTVEFHRVMiLCJmaWx0ZXJlZExvZ3MiLCJmaWx0ZXIiLCJlbnRyeSIsInN0YWdlIiwiZ2V0U3RhZ2VDb2xvciIsImNsYXNzTmFtZSIsImNoaWxkcmVuIiwidmFsdWUiLCJvbkNoYW5nZSIsImUiLCJ0YXJnZXQiLCJtYXAiLCJjaGFpblN1bW1hcnkiLCJjaGFpbkNvdW50IiwiZWxlbWVudHNXYWxrZWQiLCJvcnBoYW5Db3VudCIsInRpZXIxIiwidGllcjIiLCJ0aWVyMyIsInRpZXI0Iiwicm93c1dpdGhBY3Rpb25zIiwibGVuZ3RoIiwiaW5kZXgiLCJ0aW1lU3RyaW5nIiwidGltZXN0YW1wIiwic3Vic3RyaW5nIiwiRGF0ZSIsInRvSVNPU3RyaW5nIiwidHlwZSIsInJ1bGVJZCIsInJvdyIsIm1lc3NhZ2UiXSwic291cmNlcyI6WyJDb3JlUHJvY2Vzc29yVGFiLmpzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUmVhY3QsIHsgdXNlU3RhdGUgfSBmcm9tICdyZWFjdCc7XG5pbXBvcnQgeyB1c2VBcHBDb250ZXh0IH0gZnJvbSAnLi4vLi4vc3RvcmUvQXBwQ29udGV4dCc7XG5cbmV4cG9ydCBmdW5jdGlvbiBDb3JlUHJvY2Vzc29yVGFiKCkge1xuICBjb25zdCB7IHN0YXRlIH0gPSB1c2VBcHBDb250ZXh0KCk7XG4gIGNvbnN0IHsgbG9nLCBzbWFydEZpeCB9ID0gc3RhdGU7XG4gIGNvbnN0IFtzdGFnZUZpbHRlciwgc2V0U3RhZ2VGaWx0ZXJdID0gdXNlU3RhdGUoJ0FMTCcpO1xuXG4gIGNvbnN0IFNUQUdFUyA9IFsnQUxMJywgJ0lNUE9SVCcsICdUUkFOU0xBVElPTicsICdWQUxJREFUSU9OJywgJ0ZJWElORycsICdFWFBPUlQnLCAnVU5LTk9XTiddO1xuXG4gIGNvbnN0IGZpbHRlcmVkTG9ncyA9IHN0YWdlRmlsdGVyID09PSAnQUxMJ1xuICAgID8gbG9nXG4gICAgOiBsb2cuZmlsdGVyKGVudHJ5ID0+IChlbnRyeS5zdGFnZSB8fCAnVU5LTk9XTicpID09PSBzdGFnZUZpbHRlcik7XG5cbiAgY29uc3QgZ2V0U3RhZ2VDb2xvciA9IChzdGFnZSkgPT4ge1xuICAgIHN3aXRjaChzdGFnZSkge1xuICAgICAgY2FzZSAnSU1QT1JUJzogcmV0dXJuICdiZy1wdXJwbGUtMTAwIHRleHQtcHVycGxlLTgwMCBib3JkZXItcHVycGxlLTIwMCc7XG4gICAgICBjYXNlICdUUkFOU0xBVElPTic6IHJldHVybiAnYmctaW5kaWdvLTEwMCB0ZXh0LWluZGlnby04MDAgYm9yZGVyLWluZGlnby0yMDAnO1xuICAgICAgY2FzZSAnVkFMSURBVElPTic6IHJldHVybiAnYmctcGluay0xMDAgdGV4dC1waW5rLTgwMCBib3JkZXItcGluay0yMDAnO1xuICAgICAgY2FzZSAnRklYSU5HJzogcmV0dXJuICdiZy1hbWJlci0xMDAgdGV4dC1hbWJlci04MDAgYm9yZGVyLWFtYmVyLTIwMCc7XG4gICAgICBjYXNlICdFWFBPUlQnOiByZXR1cm4gJ2JnLXRlYWwtMTAwIHRleHQtdGVhbC04MDAgYm9yZGVyLXRlYWwtMjAwJztcbiAgICAgIGRlZmF1bHQ6IHJldHVybiAnYmctc2xhdGUtMTAwIHRleHQtc2xhdGUtODAwIGJvcmRlci1zbGF0ZS0yMDAnO1xuICAgIH1cbiAgfTtcblxuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBoLVtjYWxjKDEwMHZoLTEycmVtKV0gb3ZlcmZsb3ctaGlkZGVuXCI+XG5cbiAgICAgIHsvKiBGaWx0ZXJzICovfVxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJtYi00IGZsZXggaXRlbXMtY2VudGVyIGdhcC00IGJnLXdoaXRlIHAtMyByb3VuZGVkLWxnIGJvcmRlciBib3JkZXItc2xhdGUtMjAwIHNoYWRvdy1zbSBzaHJpbmstMFwiPlxuICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LXNlbWlib2xkIHRleHQtc2xhdGUtNzAwXCI+RmlsdGVyIGJ5IFN0YWdlOjwvbGFiZWw+XG4gICAgICAgIDxzZWxlY3RcbiAgICAgICAgICB2YWx1ZT17c3RhZ2VGaWx0ZXJ9XG4gICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiBzZXRTdGFnZUZpbHRlcihlLnRhcmdldC52YWx1ZSl9XG4gICAgICAgICAgY2xhc3NOYW1lPVwiYmctc2xhdGUtNTAgYm9yZGVyIGJvcmRlci1zbGF0ZS0zMDAgdGV4dC1zbGF0ZS05MDAgdGV4dC1zbSByb3VuZGVkLWxnIGZvY3VzOnJpbmctYmx1ZS01MDAgZm9jdXM6Ym9yZGVyLWJsdWUtNTAwIGJsb2NrIHAtMlwiXG4gICAgICAgID5cbiAgICAgICAgICB7U1RBR0VTLm1hcChzdGFnZSA9PiAoXG4gICAgICAgICAgICA8b3B0aW9uIGtleT17c3RhZ2V9IHZhbHVlPXtzdGFnZX0+e3N0YWdlID09PSAnQUxMJyA/ICdBbGwgU3RhZ2VzJyA6IHN0YWdlfTwvb3B0aW9uPlxuICAgICAgICAgICkpfVxuICAgICAgICA8L3NlbGVjdD5cbiAgICAgIDwvZGl2PlxuXG4gICAgICB7c21hcnRGaXguY2hhaW5TdW1tYXJ5ICYmIChcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJiZy1zbGF0ZS01MCBwLTQgcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLXNsYXRlLTIwMCBtYi02IHNoYWRvdy1zbSBzaHJpbmstMFwiPlxuICAgICAgICAgIDxoNCBjbGFzc05hbWU9XCJmb250LXNlbWlib2xkIHRleHQtc2xhdGUtODAwIG1iLTQgYm9yZGVyLWIgcGItMlwiPlNtYXJ0IEZpeCBTdW1tYXJ5PC9oND5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImdyaWQgZ3JpZC1jb2xzLTIgbWQ6Z3JpZC1jb2xzLTQgZ2FwLTQgdGV4dC1zbVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzcGFjZS15LTJcIj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlblwiPjxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNTAwXCI+Q2hhaW5zIGZvdW5kPC9zcGFuPjxzcGFuIGNsYXNzTmFtZT1cImZvbnQtbW9ubyBmb250LW1lZGl1bVwiPntzbWFydEZpeC5jaGFpblN1bW1hcnkuY2hhaW5Db3VudH08L3NwYW4+PC9kaXY+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW5cIj48c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTUwMFwiPkVsZW1lbnRzIHdhbGtlZDwvc3Bhbj48c3BhbiBjbGFzc05hbWU9XCJmb250LW1vbm8gZm9udC1tZWRpdW1cIj57c21hcnRGaXguY2hhaW5TdW1tYXJ5LmVsZW1lbnRzV2Fsa2VkfTwvc3Bhbj48L2Rpdj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlblwiPjxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNTAwXCI+T3JwaGFuIGVsZW1lbnRzPC9zcGFuPjxzcGFuIGNsYXNzTmFtZT1cImZvbnQtbW9ubyBmb250LW1lZGl1bSB0ZXh0LXJlZC02MDBcIj57c21hcnRGaXguY2hhaW5TdW1tYXJ5Lm9ycGhhbkNvdW50fTwvc3Bhbj48L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzcGFjZS15LTJcIj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBib3JkZXItbCBwbC00IGJvcmRlci1zbGF0ZS0yMDBcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTUwMFwiPlRpZXIgMSAoYXV0by1zaWxlbnQpPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtbW9ubyBmb250LW1lZGl1bSB0ZXh0LWdyZWVuLTYwMFwiPntzbWFydEZpeC5jaGFpblN1bW1hcnkudGllcjF9PC9zcGFuPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBib3JkZXItbCBwbC00IGJvcmRlci1zbGF0ZS0yMDBcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTUwMFwiPlRpZXIgMiAoYXV0by1sb2dnZWQpPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtbW9ubyBmb250LW1lZGl1bSB0ZXh0LWFtYmVyLTYwMFwiPntzbWFydEZpeC5jaGFpblN1bW1hcnkudGllcjJ9PC9zcGFuPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBib3JkZXItbCBwbC00IGJvcmRlci1zbGF0ZS0yMDBcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTUwMFwiPlRpZXIgMyAod2FybmluZ3MpPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtbW9ubyBmb250LW1lZGl1bSB0ZXh0LW9yYW5nZS02MDBcIj57c21hcnRGaXguY2hhaW5TdW1tYXJ5LnRpZXIzfTwvc3Bhbj5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gYm9yZGVyLWwgcGwtNCBib3JkZXItc2xhdGUtMjAwXCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1zbGF0ZS01MDBcIj5UaWVyIDQgKGVycm9ycyk8L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZm9udC1tb25vIGZvbnQtbWVkaXVtIHRleHQtcmVkLTYwMFwiPntzbWFydEZpeC5jaGFpblN1bW1hcnkudGllcjR9PC9zcGFuPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJjb2wtc3Bhbi0yIHNwYWNlLXktMlwiPlxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIHAtMyBiZy13aGl0ZSByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtMjAwIHNoYWRvdy1zbSBqdXN0aWZ5LWJldHdlZW5cIj5cbiAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTcwMFwiPlJvd3Mgd2l0aCBwcm9wb3NlZCBmaXhlczwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC14bCBmb250LWJvbGQgdGV4dC1ibHVlLTYwMFwiPntzbWFydEZpeC5jaGFpblN1bW1hcnkucm93c1dpdGhBY3Rpb25zfTwvc3Bhbj5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICApfVxuXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgtMSBvdmVyZmxvdy1hdXRvIGJnLXdoaXRlIGJvcmRlciBib3JkZXItc2xhdGUtMjAwIHJvdW5kZWQtbGcgc2hhZG93LXNtIGZvbnQtbW9ubyB0ZXh0LXNtIGxlYWRpbmctcmVsYXhlZCBwLTRcIj5cbiAgICAgICAge2xvZy5sZW5ndGggPT09IDAgPyAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTQwMCBpdGFsaWNcIj5ObyBsb2dzIGF2YWlsYWJsZS4gUnVuIFNtYXJ0IEZpeCB0byBnZW5lcmF0ZSBsb2dzLjwvZGl2PlxuICAgICAgICApIDogKFxuICAgICAgICAgIDx0YWJsZSBjbGFzc05hbWU9XCJ3LWZ1bGwgdGV4dC1sZWZ0IGJvcmRlci1jb2xsYXBzZVwiPlxuICAgICAgICAgICAgPHRoZWFkIGNsYXNzTmFtZT1cImJnLXNsYXRlLTUwIHN0aWNreSB0b3AtMCBib3JkZXItYiBib3JkZXItc2xhdGUtMjAwIHotMTAgdGV4dC14cyB0ZXh0LXNsYXRlLTUwMCB1cHBlcmNhc2VcIj5cbiAgICAgICAgICAgICAgPHRyPlxuICAgICAgICAgICAgICAgIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTJcIj5UaW1lc3RhbXA8L3RoPlxuICAgICAgICAgICAgICAgIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTJcIj5TdGFnZTwvdGg+XG4gICAgICAgICAgICAgICAgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMlwiPlR5cGU8L3RoPlxuICAgICAgICAgICAgICAgIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTJcIj5SdWxlPC90aD5cbiAgICAgICAgICAgICAgICA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yXCI+Um93PC90aD5cbiAgICAgICAgICAgICAgICA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yXCI+TWVzc2FnZTwvdGg+XG4gICAgICAgICAgICAgIDwvdHI+XG4gICAgICAgICAgICA8L3RoZWFkPlxuICAgICAgICAgICAgPHRib2R5IGNsYXNzTmFtZT1cImRpdmlkZS15IGRpdmlkZS1zbGF0ZS0xMDBcIj5cbiAgICAgICAgICAgICAge2ZpbHRlcmVkTG9ncy5tYXAoKGVudHJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRpbWVTdHJpbmcgPSBlbnRyeS50aW1lc3RhbXAgPyBlbnRyeS50aW1lc3RhbXAuc3Vic3RyaW5nKDExLCAyMykgOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc3Vic3RyaW5nKDExLCAyMyk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhZ2UgPSBlbnRyeS5zdGFnZSB8fCAnVU5LTk9XTic7XG4gICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgIDx0ciBrZXk9e2luZGV4fSBjbGFzc05hbWU9e2Bob3ZlcjpiZy1zbGF0ZS01MCAke2VudHJ5LnR5cGUgPT09ICdFcnJvcicgPyAnYmctcmVkLTUwLzIwJyA6IGVudHJ5LnR5cGUgPT09ICdXYXJuaW5nJyA/ICdiZy1vcmFuZ2UtNTAvMjAnIDogJyd9YH0+XG4gICAgICAgICAgICAgICAgICAgIDx0ZCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1zbGF0ZS00MDAgdGV4dC14cyB3aGl0ZXNwYWNlLW5vd3JhcFwiPnt0aW1lU3RyaW5nfTwvdGQ+XG4gICAgICAgICAgICAgICAgICAgIDx0ZCBjbGFzc05hbWU9XCJweC0zIHB5LTJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtgdGV4dC1bMTBweF0gcHgtMiBweS0wLjUgcm91bmRlZCBib3JkZXIgZm9udC1zZW1pYm9sZCAke2dldFN0YWdlQ29sb3Ioc3RhZ2UpfWB9PlxuICAgICAgICAgICAgICAgICAgICAgICAgIHtzdGFnZX1cbiAgICAgICAgICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L3RkPlxuICAgICAgICAgICAgICAgICAgICA8dGQgY2xhc3NOYW1lPXtgcHgtMyBweS0yIGZvbnQtbWVkaXVtICR7ZW50cnkudHlwZSA9PT0gJ0Vycm9yJyA/ICd0ZXh0LXJlZC02MDAnIDogZW50cnkudHlwZSA9PT0gJ1dhcm5pbmcnID8gJ3RleHQtb3JhbmdlLTYwMCcgOiBlbnRyeS50eXBlID09PSAnRml4JyA/ICd0ZXh0LWFtYmVyLTYwMCcgOiBlbnRyeS50eXBlID09PSAnQXBwbGllZCcgPyAndGV4dC1ncmVlbi02MDAnIDogJ3RleHQtYmx1ZS02MDAnfWB9PntlbnRyeS50eXBlfTwvdGQ+XG4gICAgICAgICAgICAgICAgICAgIDx0ZCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1zbGF0ZS01MDBcIj57ZW50cnkucnVsZUlkIHx8ICctJ308L3RkPlxuICAgICAgICAgICAgICAgICAgICA8dGQgY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtc2xhdGUtNTAwXCI+e2VudHJ5LnJvdyB8fCAnLSd9PC90ZD5cbiAgICAgICAgICAgICAgICAgICAgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LXNsYXRlLTgwMCBicmVhay13b3Jkc1wiPntlbnRyeS5tZXNzYWdlfTwvdGQ+XG4gICAgICAgICAgICAgICAgICA8L3RyPlxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0pfVxuICAgICAgICAgICAgPC90Ym9keT5cbiAgICAgICAgICA8L3RhYmxlPlxuICAgICAgICApfVxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gICk7XG59XG4iXSwibWFwcGluZ3MiOiJBQUFBLE9BQU9BLEtBQUssSUFBSUMsUUFBUSxRQUFRLE9BQU87QUFDdkMsU0FBU0MsYUFBYSxRQUFRLHdCQUF3QjtBQUFDLFNBQUFDLEdBQUEsSUFBQUMsSUFBQSxFQUFBQyxJQUFBLElBQUFDLEtBQUE7QUFFdkQsT0FBTyxTQUFTQyxnQkFBZ0JBLENBQUEsRUFBRztFQUNqQyxNQUFNO0lBQUVDO0VBQU0sQ0FBQyxHQUFHTixhQUFhLENBQUMsQ0FBQztFQUNqQyxNQUFNO0lBQUVPLEdBQUc7SUFBRUM7RUFBUyxDQUFDLEdBQUdGLEtBQUs7RUFDL0IsTUFBTSxDQUFDRyxXQUFXLEVBQUVDLGNBQWMsQ0FBQyxHQUFHWCxRQUFRLENBQUMsS0FBSyxDQUFDO0VBRXJELE1BQU1ZLE1BQU0sR0FBRyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQztFQUU1RixNQUFNQyxZQUFZLEdBQUdILFdBQVcsS0FBSyxLQUFLLEdBQ3RDRixHQUFHLEdBQ0hBLEdBQUcsQ0FBQ00sTUFBTSxDQUFDQyxLQUFLLElBQUksQ0FBQ0EsS0FBSyxDQUFDQyxLQUFL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