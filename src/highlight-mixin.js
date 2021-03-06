import Vue from "vue";
import { toRange, fromRange } from "dom-anchor-text-quote";
import highlight, { getSelectedRange } from "./utils/highlight";
import Highlight from "./components/Highlight";
import _ from "lodash";

function findPos(node) {
  const range = document.createRange();
  range.selectNode(node);
  return range.getBoundingClientRect();
}

// Finds the most right/bottom node in selection regardless of selection direction
function getLatestNode(selection) {
  const { focusNode, focusOffset, anchorNode, anchorOffset } = selection;
  const focusBottom = findPos(focusNode).bottom;
  const anchorBottom = findPos(anchorNode).bottom;
  let node = null;
  let offset = 0;
  if (focusBottom === anchorBottom) {
    if (anchorOffset < focusOffset) {
      node = focusNode;
      offset = focusOffset;
    } else {
      node = anchorNode;
      offset = anchorOffset;
    }
  } else if (focusBottom > anchorBottom) {
    node = focusNode;
    offset = focusOffset;
  } else {
    node = anchorNode;
    offset = anchorOffset;
  }
  return { node, offset };
}

const HighlightMixin = {
  data: function() {
    return {
      hlRange: null,
      hlHighlightMenu: null,
      hlSelectionMenu: null,
      hlMenuHookParent: null,
      ymConfig: {
        debounceDelay: 200,
        menuComponent: null,
        highlight: {
          component: Highlight,
        }
      },
      finalSelection: null,
    };
  },
  mounted: function() {
    document.addEventListener(
      "selectionchange",
      _.debounce(this.ymSelectionChanged, this.ymConfig.debounceDelay)
    );
    document.addEventListener(
      "mousedown",
      this.ymClickOutsideHandler,
    );
    document.addEventListener(
      "touchstart",
      this.ymClickOutsideHandler,
    );
  },
  methods: {
    ymClickOutsideHandler(event) {
      if (!this.hlHighlightMenu) {
        return;
      }
      if (event.target && event.target.classList.contains('Highlight')) {
        return;
      }
      const element = this.hlHighlightMenu.$el;
      const content = element.getElementsByClassName('ContextMenu-content')[0];
      if (event.target !== content && !content.contains(event.target)){
        this.ymRemoveHighlightMenu();
      }
    },
    ymSelectionAllowed() {
      return true;
    },
    ymSelectionChanged(e) {
      e.preventDefault();
      e.stopPropagation();
      const selection = window.getSelection();
      const { focusNode, anchorNode } = selection;
      if (
        selection.isCollapsed ||
        !anchorNode ||
        !this.$el.contains(anchorNode) ||
        !focusNode ||
        !this.$el.contains(focusNode) ||
        !this.ymSelectionAllowed(selection)
      ) {
        // Do not show menu if selection is collapsed or outside element
        this.ymRemoveSelectionMenu();
        return;
      }
      this.hlRange = selection.getRangeAt(0);
      this.ymCreateSelectionMenu(selection);
    },
    // Highlights text and specifies a click handler
    ymHighlight(
      { prefix, suffix, exact, location_hint },
      clickHandler,
      props,
      customObject = {}
    ) {
      if (this.$el === undefined) {
        throw Error(
          "highlight: this.$el is undefined. Make sure the component is mounted."
        );
      }
      if (!exact) {
        return;
      }
      const options = {};
      if (location_hint) {
        options.hint = location_hint;
      }
      const range = toRange(this.$el, {
        prefix,
        suffix,
        exact,
      }, options);
      return highlight(
        this.$el,
        customObject,
        clickHandler,
        this.ymConfig.highlight.component,
        props,
        range
      );
    },
    ymHighlightSelection(clickHandler, props, customObject = {}) {
      if (this.$el === undefined) {
        throw Error(
          "highlight: this.$el is undefined. Make sure the component is mounted."
        );
      }
      return highlight(
        this.$el,
        customObject,
        clickHandler,
        this.ymConfig.highlight.component,
        props,
        this.hlRange
      );
    },
    ymGetSelectionTextQuote() {
      const range = getSelectedRange(this.finalSelection);
      if (range) {
        return fromRange(this.$el, range);
      }
      return null;
    },
    ymRemoveMenu() {
      this.ymRemoveSelectionMenu();
      this.ymRemoveHighlightMenu();
    },
    ymRemoveSelectionMenu() {
      if (this.hlSelectionMenu) {
        this.hlSelectionMenu.$destroy();
        this.hlSelectionMenu.$el.remove();
        this.hlSelectionMenu = null;
        if (this.hlMenuHookParent) {
          this.hlMenuHookParent.normalize();
        }
      }
    },
    ymRemoveHighlightMenu() {
      if (this.hlHighlightMenu) {
        this.hlHighlightMenu.$destroy();
        this.hlHighlightMenu.$el.remove();
        this.hlHighlightMenu = null;
      }
    },
    ymRemoveSelection() {
      window.getSelection().removeAllRanges();
    },
    ymCreateMenuComponent(menuComponent, props) {
      const ComponentBuilder = Vue.extend(Object.assign(menuComponent));
      return new ComponentBuilder({ propsData: props });
    },
    ymCreateMenu(menuComponent, actions, props = {}) {
      const menu = this.ymCreateMenuComponent(menuComponent, props);
      menu.$mount();
      Object.keys(actions).forEach(eventName => {
        menu.$on(eventName, actions[eventName]);
      });
      return menu;
    },
    ymAdjustMenuPosition(element) {
      const content = element.getElementsByClassName('ContextMenu-content')[0];
      const tip = element.getElementsByClassName('ContextMenu-tip')[0];
      const rect = content.getBoundingClientRect();
      if (rect.left < 0) {
        const offset = -rect.left + 1;
        element.style.left = `${offset}px`;
        const tipLeft = rect.width / 2 - offset - 8;
        tip.style.marginLeft = `${tipLeft}px`;
      } else if(rect.right > window.innerWidth) {
        const offset = (rect.right - window.innerWidth) * 2 + 2;
        content.style.marginLeft = `-${offset}px`;
        const tipLeft = rect.width / 2 + offset / 2 - 8;
        tip.style.marginLeft = `${tipLeft}px`;
      }
    },
    ymCreateHighlightMenu(nodes) {
      const menu = this.ymConfig.menus.highlight;
      const actions = menu.actions;
      const props = menu.props;
      this.ymAddMenuToHighlight(nodes, menu.component, actions, props);
    },
    ymCreateSelectionMenu(selection) {
      const menu = this.ymConfig.menus.selection;
      const actions = menu.actions;
      const props = menu.props;
      this.finalSelection = {
        focusNode: selection.focusNode,
        rangeAtZero: selection.getRangeAt(0),
      };
      this.ymAddMenuToSelection(selection, menu.component, actions, props);
    },
    ymAddMenuToHighlight(nodes, component, actions = {}, props = {}) {
      this.ymRemoveMenu();
      this.hlHighlightMenu = this.ymCreateMenu(component, actions, props);
      const menuElement = this.hlHighlightMenu.$el;
      const lastNode = nodes.slice(-1).pop();
      lastNode.parentElement.appendChild(menuElement);
      this.ymAdjustMenuPosition(menuElement);
    },
    ymAddMenuToSelection(selection, component, actions = {}, props = {}) {
      this.ymRemoveMenu();
      // Add menu at the end of selected range
      const { node } = getLatestNode(selection);
      const range = this.hlRange.cloneRange();
      range.collapse(false);
      this.hlMenuHookParent = node.parentElement;
      this.hlSelectionMenu = this.ymCreateMenu(component, actions, props);
      const menuElement = this.hlSelectionMenu.$el;
      range.insertNode(this.hlSelectionMenu.$el);
      this.ymAdjustMenuPosition(menuElement);
    },
    ymGetSelectedRange() {
      return getSelectedRange(this.finalSelection);
    },
  }
};

export default HighlightMixin;
