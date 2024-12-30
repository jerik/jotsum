/** Add a new calculation line **/
function add_calc_line() {
	const nr_line = document.createElement('nr-line');
	nr_line.setAttribute('contenteditable', 'true'); 
	const nr_sum = document.createElement('nr-sum');
	const nr_sheet = document.getElementById('sheet');
	// console.log(nr_sheet);
	nr_sheet.appendChild(nr_line); 
	nr_sheet.appendChild(nr_sum); 

	nr_line.focus();
}

class Nebenrechnung {
	total; 
	subtotal;

	constructor() {
		this.#get_sheet();
		this.#key_listener(); 
	}

	#key_listener() {
		// console.log('key_listener');
		document.body.addEventListener('keyup', this.#keyups.bind(this));
		document.body.addEventListener('keydown', this.#keydowns.bind(this));
	}

	#keyups(e) {
		// console.log(e.code);
		this.#get_sheet();
	}
	#keydowns(e) {
		// console.log(e.code, e.which);
		if(e.which == 13) { // Enter, keycode 13;  @todo in IE e.keyCode ??
			if (e.target.tagName == 'NR-LINE') {
				e.preventDefault(); // Avoid standard action, here make a carriage return in the text field

				const cur_line = document.activeElement; 
				const next_line =  cur_line.nextElementSibling.nextElementSibling; 
				if (next_line == null)	{
					add_calc_line();
				} else {
					this.line_movement('down');
				}
			}
		}

		// @todo error handling if I am on the first element. Perhaps circulate?
		if(e.which == 38) { // ArrowUp
			if (e.target.tagName == 'NR-LINE') {
				this.line_movement('up');

			}
		}

		// @todo error handling if I am on the last element. Perhaps circulate?
		if(e.which == 40) { // ArrowDown
			if (e.target.tagName == 'NR-LINE') {
				this.line_movement('down');

			}
		}
	}

	line_movement(direction) {
		const cur_element = document.activeElement;
		// console.log(cur_element);
		let new_element = '';
		if (direction == 'up') {
			new_element = cur_element.previousElementSibling.previousElementSibling;
		} else {
			new_element = cur_element.nextElementSibling.nextElementSibling;
		}
		new_element.focus(); 
		// console.log(new_element);
	}

	#get_sheet() {
		const sheet = document.querySelector('nr-sheet');

		this.total = 0;
		Array.from(sheet.children).forEach((child, index) => {
			// console.log(`Element ${index + 1}:`, child.tagName, child.textContent.trim());
			if (child.tagName == 'NR-LINE') {
				this.#read_line(child); 
			} else if (child.tagName == 'NR-SUM') {
				// console.log(child);
				this.#to_sum(child, index);
			}

	    });

		const tag_total = document.getElementById('total');
		tag_total.textContent = this.#round(this.total);
	}

	#read_line(tag) {
		this.subtotal = 0;
		const calc = new Array();

		const words = tag.textContent.split(' ');
		words.forEach(function(item) {
			let is_float = parseFloat(item);
			
			if (!isNaN(is_float)) {
				calc.push(is_float);
			} else if( item.length == 1 && item.match( /([-()+*/%])/ )) { 
				calc.push(item);
			} else {
				// console.log(`ELSE: ${item}`);
			}
		})
		// console.log(calc);
		this.subtotal = eval(calc.join(''));
		if (this.subtotal == undefined) {
			this.subtotal = 0; // initialise subtotal if nr-line is empty
		}
		// console.log(this.subtotal);
		this.total += this.subtotal; 
		// console.log(this.total);
	}

	#to_sum(tag, value) {
		tag.textContent = this.#round(this.subtotal); 
	}

	#round(num) {
		console.log(num);
		if (num % 1 !== 0) { // check if it is an decimal number
			num = num.toFixed(4); // round to 4 decimals
			console.log(num);
		} 
		return num; 
	}

}

window.onload = function () {
	const nr = new Nebenrechnung(); 
}
