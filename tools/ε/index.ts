import { isEqual } from 'lodash';
import {
  Element,
  Attributes,
  Children
} from './frameworkTypes';
import elementToString from './elementToString';

interface INST_INFO {
  instance: any;
  props: any;
  state: any;
}
interface INT_INST_COMP {
  [name: string]: INST_INFO;
};

// Variables
let nbComponents = 0;
let rootName: string | null = null;
let actualDom: Element | string | null = null;
let haveToUpdate: string | null = null;
const INST_COMP: INT_INST_COMP = {};

// Base class for components
interface PropsComponent {
  [name: string]: any;
}
interface StateComponent {
  [name: string]: any;
}
abstract class Component {
  _id: number;
  props: PropsComponent = {};
  state: StateComponent = {};
  constructor(props = {}, increment: number | boolean) {
    this.props = props;
    if(typeof increment === 'boolean') {
      this._id = nbComponents ++;
    } else if(typeof increment === 'number') {
      this._id = increment;
    }
  }

  setState = (changeState: any, callback?: any) => {
    const copyState = JSON.parse(JSON.stringify(this.state));
    let newState = {};
    if(typeof changeState === 'function') {
      newState = changeState(copyState);
    } else if (typeof changeState === 'object') {
      newState = changeState;
    } else {
      console.info('New state can be only object or function that return object');
    }
    
    this.state = {
      ...copyState,
      ...newState
    }

    haveToUpdate = this._id;
    if(callback) {
      callback(newState);
    }

  }

  return = <C>(name: C, attributes: Attributes, children: Children): Element => {
    return createElement(name, attributes, children, this._id);
  }
}

/**
 * Create an element
 */
function createElement<C>(name: C, attributes: Attributes, children: Children, _id?: number ): Element<C> {
  return ({
    _id,
    container: name,
    attributes,
    children
  });
}

/**
 * Create a HTML NODE from element.
 */
function elementToHTML(element: Element):HTMLElement | string {
  const htmlBloc = createHTMLTag(element);
  return htmlBloc;
}

const RESERVED_TAG_WORDS = ['text'];
const EVENTS_REGISTERED = {
  'onClick': 'click',
};

function createHTMLTag(e: Element):HTMLElement | string {
  // Case of Element being a html node
  if (typeof e.container === 'string') {
    if(!RESERVED_TAG_WORDS.includes(e.container)) {
      // html tag
      const tag = document.createElement(e.container);
      if (e._id) {
        tag.setAttribute('data-e', e._id.toString());
      }
      Object.keys(e.attributes).forEach(name => {
        if (name === 'class' && typeof e.attributes[name] === 'string') {
          tag.setAttribute(name, e.attributes[name] as string);
        }
        if(Object.keys(EVENTS_REGISTERED).includes(name) && typeof e.attributes[name] === 'function') {
          tag.addEventListener(EVENTS_REGISTERED[name], e.attributes[name] as ((...args: any[]) => any));
        }
      });
      if (e.children) {
        if (typeof e.children === 'string') {
          tag.innerHTML = e.children;
        } else {
          e.children.forEach(child => {
            const c = createHTMLTag(child);
            if (typeof c === 'string') {
              tag.innerHTML = c;
            } else {
               tag.appendChild(c);
            }
          });
        }
      }
      return tag;
    } else {
      // special cases handled
      if (e.container === 'text') {
        if (typeof e.children === 'string') {
          return e.children;
        }
      }
    }
  }

  // Case of Element being a Component
  // if (typeof e.container === 'function') {
  //   const renderElement = INST_COMP[e._id].render();
  //   return createHTMLTag(renderElement);
  // }
}

function updateOneInstance(name, instance, props, state) {
  // Counting on Name to identity the component is a mistake, We Can not reuse the component! 
  INST_COMP[name] = {
    instance,
    props: JSON.parse(JSON.stringify(props)),
    state: JSON.parse(JSON.stringify(state))
  };
}

function isPropsAndStateEqual(oldProps: any, oldState: any, newProps: any, newState:any): boolean {
  let equal = true;
  equal = isEqual(oldProps, newProps);
  equal = isEqual(oldState, newState);
  return equal;
}

function activateComponent(e: Element, register:boolean): Element {
  let render;
  const name = e.container.name;
  if(e._forceRender && name in INST_COMP) {
    const newInstance = new e.container({...e.attributes, children: e.children}, e._id);
    updateOneInstance(name, newInstance, newInstance.props, newInstance.state);
    render = newInstance.render();
  } else if (name in INST_COMP) {
    const c = INST_COMP[name];
    if (!isPropsAndStateEqual(c.props, c.state, c.instance.props, c.instance.state)) {
      updateOneInstance(name, c.instance, c.instance.props, c.instance.state);
      render = c.instance.render();
      if(typeof render.children !== 'string') {
        render.children.forEach(child => {
          child._forceRender = true;
        });
      }
    } else {
      render = e;
    }
  } else {
    const instance = new e.container({...e.attributes, children: e.children}, true);
    if(register) {
      updateOneInstance(name, instance, instance.props, instance.state);
    }
    render = instance.render();
  }
  return render;
}

function getChildrenElements(e: Element, register: boolean) {
  let elementToReturn: Element;
  if(typeof e.container !== 'string') {
    elementToReturn = activateComponent(e, register);
  } else {
    elementToReturn = e;
  }

  if (typeof elementToReturn.children !== 'string') {
    let colChildren;
    colChildren = (elementToReturn.children as Element[]).map(child => getChildrenElements(child, register));
    elementToReturn.children = colChildren;
  }
  return elementToReturn;
}

function getVirtualDom(e: Element, register: boolean = true) {
  return getChildrenElements(e, register);
}

function start(rootComponent: any, rootHtml: HTMLElement): void {
  const instance = new rootComponent({}, true);
  const element = instance.render();
  rootName = rootComponent.name;
  updateOneInstance(rootComponent.name, instance, instance.props, instance.state);
  const virtualDom = getVirtualDom(element);
  const site = elementToHTML(virtualDom);
  if (!actualDom) {
    if (typeof site === 'string') {
      rootHtml.innerHTML = site;
    } else {
      rootHtml.appendChild(site);
    }
    actualDom = virtualDom;
    startUpdateLoop();
  }
}

function startUpdateLoop() {
  const unsub = setTimeout(() => {
    updateDom();
    clearTimeout(unsub);
    startUpdateLoop();
  }, 60);
}


function updateDom() {
  if (haveToUpdate && typeof actualDom === 'object') {
    const newRender = INST_COMP[rootName].instance.render();
    const newDOM = getVirtualDom(newRender, false);
    // Fonction diff basique, à modifier pour qu'elle donne des infos plus pertinente
    const diff = makeDiff(newDOM,actualDom, newRender);
    // Cette exemple d'update du DOM est très limité
    // A vous de modifier d'essayer de la rendre utile pour tous les cas.
    if (diff.length > 0) {
      diff.forEach(d => {
        if(d.element._id) {
          const bloc = document.querySelector(`[data-e="${d.element._id}"]`);
          const newFragment = elementToHTML(d.element) as HTMLElement;
          bloc.innerHTML = '';
          bloc.append(...newFragment.childNodes);
        } else {
          if(!RESERVED_TAG_WORDS.includes(d.element.container)) {
            const col = document.querySelectorAll(d.element.container);
            col.forEach(c => {
              if(c.innerHTML === d.difference.old) {
                c.innerHTML = d.difference.new
              }
            });
          } else {
            const col = document.querySelectorAll(d.parent.container);
            col.forEach(c => {
              if(c.innerHTML === d.difference.old) {
                c.innerHTML = d.difference.new
              }
            });
          }
        }
      })
      actualDom = newDOM
    }
    haveToUpdate = null;
  }
}

interface DiffInfos {
  parent: Element,
  element: Element,
  difference: {
    old: any,
    new: any
  }
};

type Diff = DiffInfos[];

function compareElement(newElement, oldElement, parent): Diff {
  let diff: Diff = [];
  const keysToCheck = ["container", "attributes", "children"];
  for (let i = 0; i < keysToCheck.length; i++) {
    const key = keysToCheck[i];
    if(key !== 'children' || 
      (key === 'children' && 
      typeof newElement.children === 'string' &&
      typeof oldElement.children === 'string' )) {
        if(!isEqual(newElement[key], oldElement[key])){
          diff.push({
            parent,
            element: newElement,
            difference: {
              old: oldElement[key],
              new: newElement[key],
            }
          });
        }
    } else if (key === 'children' && 
      typeof newElement.children !== typeof oldElement.children) {
        diff.push({
          parent,
          element: newElement,
          difference: {
            old: oldElement[key],
            new: newElement[key]
          }
        });
    } else if  (key === 'children' &&
      typeof newElement.children === 'object' &&
      typeof oldElement.children === 'object') {
        const lengthNewChildren = newElement.children.length;
        const lengthOldChildren = oldElement.children.length;
        const maxLength = Math.max(lengthNewChildren, lengthOldChildren);
        for (let k = 0; k < maxLength; k++) {
          if(newElement.children[k] && oldElement.children[k]) {
            return compareElement(newElement.children[k], oldElement.children[k], newElement);
          } else if (newElement.children[k]) {
            diff.push({
              parent,
              element: newElement.children[k],
              difference: {
                old: null,
                new: newElement.children[k]
              }
            });
          } else if (oldElement.children[k]) {
            diff.push({
              parent,
              element: oldElement.children[k],
              difference: {
                old: oldElement.children[k],
                new: null
              }
            });
          }
        }
      }
  }
  
  return diff;
}

function makeDiff(newDom, oldDom, root): Diff {
  return compareElement(newDom, oldDom, root);
}

export {
  Component,
  Element,
};

export default {
  createElement,
  elementToString,
  start
};