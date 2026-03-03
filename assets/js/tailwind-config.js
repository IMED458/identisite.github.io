tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef9f8',
          100: '#d8f2ef',
          200: '#b4e5df',
          300: '#84d3cb',
          400: '#47b7ad',
          500: '#1f9d92',
          600: '#167d75',
          700: '#14645e',
          800: '#14514c',
          900: '#134440'
        },
        ink: {
          900: '#091524',
          800: '#122338',
          700: '#1c3551'
        },
        gold: {
          400: '#f3ba4a',
          500: '#d9962e'
        }
      },
      boxShadow: {
        soft: '0 20px 60px -25px rgba(9,21,36,.35)'
      },
      fontFamily: {
        heading: ['Manrope', 'Noto Sans Georgian', 'sans-serif'],
        body: ['Noto Sans Georgian', 'sans-serif']
      }
    }
  }
};
